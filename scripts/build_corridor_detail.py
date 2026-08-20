#!/usr/bin/env python3
"""Aggregate identity-free 0.01° corridor textures from local GFW CSV reports."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "global-fishing-watch" / "downloads" / "corridor-high"
OUTPUT = ROOT / "public" / "data" / "passage" / "details"
GEOMETRY = ROOT.parent / "displacement-globe" / "public" / "data" / "displacement" / "geometry.geojson"
CELL_SIZE = 0.01
PIXELS_PER_CELL = 3


@dataclass(frozen=True)
class Region:
    slug: str
    corridor_id: str
    west: float
    south: float
    east: float
    north: float

    @property
    def native_width(self) -> int:
        return round((self.east - self.west) / CELL_SIZE)

    @property
    def native_height(self) -> int:
        return round((self.north - self.south) / CELL_SIZE)


REGIONS = (
    Region("suez", "chokepoint1", 31.1, 28.7, 34.2, 32.0),
    Region("panama", "chokepoint2", -81.0, 7.7, -78.2, 10.2),
    Region("bab-el-mandeb", "chokepoint4", 41.5, 10.7, 45.0, 14.2),
    Region("malacca", "chokepoint5", 98.2, 0.0, 104.8, 7.2),
    Region("hormuz", "chokepoint6", 54.0, 24.2, 58.8, 28.2),
    Region("cape", "chokepoint7", 14.8, -37.5, 23.0, -30.5),
)


def render_route(field: np.ndarray, output_path: Path) -> None:
    nonzero = field[field > 0]
    if nonzero.size:
        logged = np.log1p(field)
        cap = float(np.quantile(logged[logged > 0], 0.997))
        normalized = np.clip(logged / max(cap, 1e-6), 0, 1)
    else:
        normalized = field
    native = Image.fromarray((normalized * 255).astype(np.uint8), "L")
    size = (field.shape[1] * PIXELS_PER_CELL, field.shape[0] * PIXELS_PER_CELL)
    smooth = native.resize(size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.48))
    values = np.asarray(smooth, dtype=np.float32) / 255
    strength = np.power(values, 0.62)
    core = np.clip((values - 0.7) / 0.3, 0, 1)
    rgba = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    rgba[..., 0] = (39 + core * 208).astype(np.uint8)
    rgba[..., 1] = (180 + core * 75).astype(np.uint8)
    rgba[..., 2] = (193 + core * 62).astype(np.uint8)
    rgba[..., 3] = (strength * 240).astype(np.uint8)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(output_path, "WEBP", quality=84, method=4)


def region_for(lon: float, lat: float) -> Region | None:
    for region in REGIONS:
        if region.west <= lon <= region.east and region.south <= lat <= region.north:
            return region
    return None


def build_archive(archive_path: Path) -> set[str]:
    fields: dict[tuple[str, str], np.ndarray] = {}
    with zipfile.ZipFile(archive_path) as archive:
        member = next(name for name in archive.namelist() if name.endswith(".csv"))
        with archive.open(member) as raw_csv:
            reader = csv.DictReader(io.TextIOWrapper(raw_csv, encoding="utf-8", newline=""))
            for row in reader:
                lon = float(row["Lon"])
                lat = float(row["Lat"])
                region = region_for(lon, lat)
                if region is None:
                    continue
                period = row["Time Range"]
                key = (region.slug, period)
                field = fields.get(key)
                if field is None:
                    field = np.zeros((region.native_height + 1, region.native_width + 1), dtype=np.float32)
                    fields[key] = field
                x = min(region.native_width, max(0, round((lon - region.west) / CELL_SIZE)))
                y = min(region.native_height, max(0, round((region.north - lat) / CELL_SIZE)))
                field[y, x] += float(row["Vessel Presence Hours"])

    periods: set[str] = set()
    for (slug, period), field in fields.items():
        output_path = OUTPUT / slug / f"route-{period}.webp"
        if not output_path.exists():
            render_route(field, output_path)
            print(f"built detail {slug} {period}", flush=True)
        periods.add(period)
    return periods


def iter_rings(geometry: dict):
    coordinates = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        yield from coordinates
    elif geometry["type"] == "MultiPolygon":
        for polygon in coordinates:
            yield from polygon


def build_land(region: Region, features: list[dict]) -> None:
    width = (region.native_width + 1) * PIXELS_PER_CELL
    height = (region.native_height + 1) * PIXELS_PER_CELL
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for feature in features:
        for ring in iter_rings(feature["geometry"]):
            points = [
                (
                    (lon - region.west) / (region.east - region.west) * width,
                    (region.north - lat) / (region.north - region.south) * height,
                )
                for lon, lat in ring
            ]
            if len(points) < 3:
                continue
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            if max(xs) < 0 or min(xs) > width or max(ys) < 0 or min(ys) > height:
                continue
            draw.polygon(points, fill=(14, 21, 23, 255))
            draw.line(points, fill=(78, 111, 114, 210), width=3, joint="curve")
    path = OUTPUT / region.slug / "land.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=88, method=4)


def write_manifest() -> None:
    features = json.loads(GEOMETRY.read_text())["features"]
    manifest = {"resolution": 0.01, "pixelsPerCell": PIXELS_PER_CELL, "corridors": {}}
    for region in REGIONS:
        build_land(region, features)
        periods = sorted(path.stem.removeprefix("route-") for path in (OUTPUT / region.slug).glob("route-*.webp"))
        manifest["corridors"][region.corridor_id] = {
            "slug": region.slug,
            "bounds": [region.west, region.south, region.east, region.north],
            "size": [(region.native_width + 1) * PIXELS_PER_CELL, (region.native_height + 1) * PIXELS_PER_CELL],
            "periods": periods,
        }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))


def archive_is_built(archive_path: Path) -> bool:
    year = archive_path.name.split("-")[2]
    final_month = 7 if year == "2026" else 12
    return all(
        (OUTPUT / region.slug / f"route-{year}-{month:02d}.webp").exists()
        for region in REGIONS
        for month in range(1, final_month + 1)
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    archives = sorted(RAW.glob("all-corridors-*-monthly-high-csv.zip"))
    if not archives:
        raise SystemExit("No combined high-resolution reports are available")
    for archive_path in archives:
        if archive_is_built(archive_path):
            continue
        build_archive(archive_path)
    write_manifest()
    print(f"built high-resolution detail from {len(archives)} yearly reports", flush=True)


if __name__ == "__main__":
    main()
