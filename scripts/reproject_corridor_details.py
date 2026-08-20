#!/usr/bin/env python3
"""Reproject named-passage route textures for exact MapLibre alignment."""

from __future__ import annotations

import json
from argparse import ArgumentParser
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DETAIL_ROOT = ROOT / "public" / "data" / "passage" / "details"
MANIFEST = DETAIL_ROOT / "manifest.json"


def mercator_y(latitude: float) -> float:
    latitude_radians = np.radians(np.clip(latitude, -85.05112878, 85.05112878))
    return float((1 - np.arcsinh(np.tan(latitude_radians)) / np.pi) / 2)


def reproject(task: tuple[Path, float, float]) -> str:
    path, south, north = task
    with Image.open(path) as image:
        pixels = np.asarray(image.convert("RGBA"), dtype=np.float32)
    height = pixels.shape[0]
    north_y = mercator_y(north)
    south_y = mercator_y(south)
    projected_y = np.linspace(north_y, south_y, height)
    latitude = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * projected_y))))
    source_y = (north - latitude) / (north - south) * (height - 1)
    lower = np.clip(np.floor(source_y).astype(np.int32), 0, height - 1)
    upper = np.minimum(lower + 1, height - 1)
    mix = (source_y - lower).astype(np.float32)[:, None, None]
    result = pixels[lower] * (1 - mix) + pixels[upper] * mix
    output = Image.fromarray(np.clip(result, 0, 255).astype(np.uint8), "RGBA")
    temporary = path.with_suffix(".mercator.webp")
    output.save(temporary, "WEBP", quality=82, method=4)
    temporary.replace(path)
    return str(path.relative_to(DETAIL_ROOT))


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    tasks: list[tuple[Path, float, float]] = []
    for corridor in manifest["corridors"].values():
        _, south, _, north = corridor["bounds"]
        folder = DETAIL_ROOT / corridor["slug"]
        tasks.extend((path, south, north) for path in sorted(folder.glob("route-*.webp")))
    with ProcessPoolExecutor(max_workers=max(1, min(args.workers, 6))) as executor:
        for name in executor.map(reproject, tasks):
            print(f"reprojected {name}", flush=True)
    manifest["projection"] = "Web Mercator within each geographic passage bound"
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
