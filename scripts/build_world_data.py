#!/usr/bin/env python3
"""Build continuously wrapping monthly Passage route fields."""

from __future__ import annotations

import json
import math
import zipfile
from argparse import ArgumentParser
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "passage"
WORLD = OUTPUT / "world"
GFW = ROOT / "data" / "raw" / "global-fishing-watch" / "downloads" / "global-monthly-low"
GEOMETRY = ROOT.parent / "displacement-globe" / "public" / "data" / "displacement" / "geometry.geojson"
WIDTH = 3600
HEIGHT = 1800


def read_tiff(period: str) -> tuple[np.ndarray, float, float, float, float]:
    archive = GFW / f"{period}.zip"
    with zipfile.ZipFile(archive) as source:
        member = next(name for name in source.namelist() if name.endswith("public-global-presence-v4.0.tif"))
        with source.open(member) as raster:
            image = Image.open(raster)
            values = np.asarray(image).copy()
            origin = image.tag_v2[33922]
            scale = image.tag_v2[33550]
    return values, float(origin[3]), float(origin[4]), float(scale[0]), float(scale[1])


def density(period: str) -> np.ndarray:
    values, west, north, lon_step, lat_step = read_tiff(period)
    rows, cols = np.nonzero(values < 999999)
    weights = np.log1p(values[rows, cols].astype(np.float32))
    lon = west + cols * lon_step
    lat = north - rows * lat_step
    x = np.rint((lon + 180) / 360 * (WIDTH - 1)).astype(np.int32)
    y = np.rint((90 - lat) / 180 * (HEIGHT - 1)).astype(np.int32)
    inside = (x >= 0) & (x < WIDTH) & (y >= 0) & (y < HEIGHT)
    field = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    np.maximum.at(field, (y[inside], x[inside]), weights[inside])
    cap = float(np.quantile(field[field > 0], 0.997))
    normalized = np.clip(field / max(cap, 1e-6), 0, 1)
    return np.asarray(
        Image.fromarray((normalized * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.72)),
        dtype=np.float32,
    ) / 255


def colorize(field: np.ndarray, path: Path) -> None:
    strength = np.power(field, 0.64)
    core = np.clip((field - 0.7) / 0.3, 0, 1)
    rgba = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    rgba[..., 0] = (39 + core * 208).astype(np.uint8)
    rgba[..., 1] = (180 + core * 75).astype(np.uint8)
    rgba[..., 2] = (193 + core * 62).astype(np.uint8)
    rgba[..., 3] = (strength * 235).astype(np.uint8)
    glow = Image.fromarray(rgba, "RGBA").filter(ImageFilter.GaussianBlur(1.6))
    Image.alpha_composite(glow, Image.fromarray(rgba, "RGBA")).save(path, "WEBP", quality=79, method=4)


def build_period(period: str) -> str:
    colorize(density(period), WORLD / f"route-{period}.webp")
    return period


def iter_rings(geometry: dict):
    coordinates = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        yield from coordinates
    elif geometry["type"] == "MultiPolygon":
        for polygon in coordinates:
            yield from polygon


def unwrap_ring(ring: list[list[float]]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    previous_x: float | None = None
    offset = 0.0
    for lon, lat in ring:
        base_x = (lon + 180) / 360 * WIDTH
        x = base_x + offset
        if previous_x is not None:
            if x - previous_x > WIDTH / 2:
                offset -= WIDTH
                x -= WIDTH
            elif previous_x - x > WIDTH / 2:
                offset += WIDTH
                x += WIDTH
        points.append((x, (90 - lat) / 180 * HEIGHT))
        previous_x = x
    return points


def build_land() -> None:
    source = json.loads(GEOMETRY.read_text())
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    for feature in source["features"]:
        for ring in iter_rings(feature["geometry"]):
            if len(ring) < 3:
                continue
            points = unwrap_ring(ring)
            for shift in (-WIDTH, 0, WIDTH):
                shifted = [(x + shift, y) for x, y in points]
                bounds = [point[0] for point in shifted]
                if max(bounds) < 0 or min(bounds) > WIDTH:
                    continue
                draw.polygon(shifted, fill=(14, 21, 23, 250))
                draw.line(shifted, fill=(72, 100, 104, 170), width=2, joint="curve")
    canvas.save(WORLD / "land.webp", "WEBP", quality=84, method=4)


def update_contract(periods: tuple[str, ...]) -> None:
    manifest_path = OUTPUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest.update({
        "periods": list(periods),
        "projection": "Continuously wrapping equirectangular world strip",
        "routeTemplate": "world/route-{period}.webp",
        "routeSize": [WIDTH, HEIGHT],
    })
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    corridors_path = OUTPUT / "corridors.json"
    corridor_data = json.loads(corridors_path.read_text())
    for corridor in corridor_data["corridors"]:
        corridor["worldX"] = round((corridor["lon"] + 180) / 360 * 100, 4)
        corridor["worldY"] = round((90 - corridor["lat"]) / 180 * 100, 4)
    corridors_path.write_text(json.dumps(corridor_data, separators=(",", ":")))


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    WORLD.mkdir(parents=True, exist_ok=True)
    periods = tuple(path.stem for path in sorted(GFW.glob("*.zip")))
    with ProcessPoolExecutor(max_workers=max(1, min(args.workers, 6))) as executor:
        for period in executor.map(build_period, periods):
            print(f"built {period}", flush=True)
    build_land()
    update_contract(periods)


if __name__ == "__main__":
    main()
