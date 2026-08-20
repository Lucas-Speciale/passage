#!/usr/bin/env python3
"""Build compact time-by-route profiles from the published passage textures."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DETAIL_ROOT = ROOT / "public" / "data" / "passage" / "details"
OUTPUT_ROOT = ROOT / "public" / "data" / "passage" / "fingerprints"
PROFILE_BINS = 112
OUTPUT_HEIGHT = 224
OUTPUT_COLUMN_WIDTH = 4


@dataclass(frozen=True)
class FingerprintConfig:
    slug: str
    cross_axis_degrees: float
    upper_label: str
    lower_label: str


CONFIGS = (
    FingerprintConfig("suez", 0, "West edge", "East edge"),
    FingerprintConfig("panama", 135, "Southwest edge", "Northeast edge"),
    FingerprintConfig("bab-el-mandeb", 0, "West edge", "East edge"),
    FingerprintConfig("malacca", 135, "Southwest edge", "Northeast edge"),
    FingerprintConfig("hormuz", 90, "North edge", "South edge"),
    FingerprintConfig("cape", 90, "North edge", "South edge"),
)


def smooth_profile(profile: np.ndarray) -> np.ndarray:
    kernel = np.array([1, 2, 4, 6, 4, 2, 1], dtype=np.float32)
    kernel /= kernel.sum()
    return np.convolve(profile, kernel, mode="same")


def transverse_profile(path: Path, cross_axis_degrees: float) -> np.ndarray:
    with Image.open(path) as image:
        alpha_image = image.getchannel("A")
        alpha_image.thumbnail((420, 420), Image.Resampling.LANCZOS)
        alpha = np.asarray(alpha_image, dtype=np.float32) / 255

    height, width = alpha.shape
    y, x = np.mgrid[0:height, 0:width]
    x = (x - (width - 1) / 2) / max(width - 1, 1)
    y = (y - (height - 1) / 2) / max(height - 1, 1)
    radians = np.radians(cross_axis_degrees)
    projected = x * np.cos(radians) + y * np.sin(radians)
    extent = (abs(np.cos(radians)) + abs(np.sin(radians))) / 2
    indices = np.clip(((projected + extent) / (2 * extent) * (PROFILE_BINS - 1)).astype(np.int32), 0, PROFILE_BINS - 1)

    profile = np.zeros(PROFILE_BINS, dtype=np.float32)
    np.maximum.at(profile, indices.ravel(), alpha.ravel())
    profile = smooth_profile(profile)
    cap = float(np.quantile(profile[profile > 0], 0.98)) if np.any(profile > 0) else 1
    return np.clip(profile / max(cap, 1e-6), 0, 1)


def colorize(matrix: np.ndarray) -> Image.Image:
    strength = np.power(np.clip(matrix, 0, 1), 0.72)
    core = np.clip((strength - 0.62) / 0.38, 0, 1)
    rgba = np.zeros((*matrix.shape, 4), dtype=np.uint8)
    rgba[..., 0] = (16 + strength * 66 + core * 170).astype(np.uint8)
    rgba[..., 1] = (39 + strength * 183 + core * 33).astype(np.uint8)
    rgba[..., 2] = (46 + strength * 188 + core * 21).astype(np.uint8)
    rgba[..., 3] = (18 + strength * 232).astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")
    return image.resize((matrix.shape[1] * OUTPUT_COLUMN_WIDTH, OUTPUT_HEIGHT), Image.Resampling.BICUBIC)


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {
        "metric": "Within-month transverse route presence",
        "description": "Each column compresses one monthly passage field across its principal route axis.",
        "corridors": {},
    }
    for config in CONFIGS:
        paths = sorted((DETAIL_ROOT / config.slug).glob("route-*.webp"))
        if not paths:
            continue
        periods = [path.stem.removeprefix("route-") for path in paths]
        matrix = np.stack([transverse_profile(path, config.cross_axis_degrees) for path in paths], axis=1)
        colorize(matrix).save(OUTPUT_ROOT / f"{config.slug}.webp", "WEBP", quality=88, method=5)
        manifest["corridors"][config.slug] = {
            "periods": periods,
            "upperLabel": config.upper_label,
            "lowerLabel": config.lower_label,
            "image": f"{config.slug}.webp",
        }
        print(f"built fingerprint {config.slug}: {len(periods)} months", flush=True)
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
