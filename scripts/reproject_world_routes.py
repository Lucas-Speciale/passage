#!/usr/bin/env python3
"""Reproject the global equirectangular route fields to square Web Mercator images."""

from __future__ import annotations

import json
import math
from argparse import ArgumentParser
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / "public" / "data" / "passage" / "world"
MANIFEST = ROOT / "public" / "data" / "passage" / "manifest.json"
SIZE = 2048
MAX_LATITUDE = 85.05112878


def mercator_latitude(y: np.ndarray) -> np.ndarray:
    return np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * y / (SIZE - 1)))))


def reproject(path: Path) -> str:
    with Image.open(path) as source_image:
        source = source_image.convert("RGBA").resize((SIZE, source_image.height), Image.Resampling.LANCZOS)
    pixels = np.asarray(source, dtype=np.float32)
    latitude = mercator_latitude(np.arange(SIZE, dtype=np.float64))
    source_y = (90 - latitude) / 180 * (pixels.shape[0] - 1)
    lower = np.floor(source_y).astype(np.int32)
    upper = np.minimum(lower + 1, pixels.shape[0] - 1)
    mix = (source_y - lower).astype(np.float32)[:, None, None]
    result = pixels[lower] * (1 - mix) + pixels[upper] * mix
    image = Image.fromarray(np.clip(result, 0, 255).astype(np.uint8), "RGBA")
    temporary = path.with_suffix(".mercator.webp")
    image.save(temporary, "WEBP", quality=79, method=4)
    temporary.replace(path)
    return path.name


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    files = sorted(WORLD.glob("route-*.webp"))
    with ProcessPoolExecutor(max_workers=max(1, min(args.workers, 6))) as executor:
        for name in executor.map(reproject, files):
            print(f"reprojected {name}", flush=True)
    manifest = json.loads(MANIFEST.read_text())
    manifest["projection"] = "Web Mercator with continuous horizontal wrapping"
    manifest["routeSize"] = [SIZE, SIZE]
    manifest["routeLatitudeExtent"] = [-MAX_LATITUDE, MAX_LATITUDE]
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
