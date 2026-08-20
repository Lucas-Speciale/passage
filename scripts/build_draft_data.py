#!/usr/bin/env python3
"""Build the compact, three-period Passage draft assets from local source files."""

from __future__ import annotations

import glob
import json
import math
import zipfile
from argparse import ArgumentParser
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pyproj import Proj


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "passage"
GFW = ROOT / "data" / "raw" / "global-fishing-watch" / "downloads" / "global-monthly-low"
PORTWATCH = ROOT / "data" / "raw" / "portwatch"
GEOMETRY = ROOT.parent / "displacement-globe" / "public" / "data" / "displacement" / "geometry.geojson"
DEMO_PERIODS = ("2012-01", "2020-04", "2026-07")
SIZE = 2400
EXTENT = 16_730_000.0


LAT0 = math.radians(-49.56371678)
AZIMUTH = math.radians(40.17823482)
ROTATION = math.radians(45)
SIN_ALPHA = -math.cos(LAT0) * math.cos(AZIMUTH)
COS_ALPHA = math.sqrt(1 - SIN_ALPHA * SIN_ALPHA)
LAMBDA_0 = math.atan2(math.tan(AZIMUTH), -math.sin(LAT0))
BETA = math.pi + math.atan2(-math.sin(AZIMUTH), -math.tan(LAT0))
ADAMS = Proj("+proj=adams_ws2 +R=6378137")


CORRIDORS = {
    "chokepoint1": {"name": "Suez Canal", "short": "Suez", "lon": 32.55, "lat": 30.0, "note": "Europe–Asia hinge"},
    "chokepoint2": {"name": "Panama Canal", "short": "Panama", "lon": -79.68, "lat": 9.08, "note": "Atlantic–Pacific shortcut"},
    "chokepoint4": {"name": "Bab el-Mandeb Strait", "short": "Bab el-Mandeb", "lon": 43.32, "lat": 12.58, "note": "Red Sea southern gate"},
    "chokepoint5": {"name": "Malacca Strait", "short": "Malacca", "lon": 101.0, "lat": 2.5, "note": "Indian–Pacific hinge"},
    "chokepoint6": {"name": "Strait of Hormuz", "short": "Hormuz", "lon": 56.35, "lat": 26.55, "note": "Gulf export passage"},
    "chokepoint7": {"name": "Cape of Good Hope", "short": "Cape route", "lon": 18.48, "lat": -34.35, "note": "Suez alternative"},
}


def project(lon: np.ndarray | float, lat: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
    lon_r = np.radians(lon)
    lat_r = np.radians(lat)
    cos_phi = np.cos(lat_r)
    sin_phi = np.sin(lat_r)
    cos_lam = np.cos(lon_r - LAMBDA_0)
    sin_lam = np.sin(lon_r - LAMBDA_0)
    phi_adams = np.arcsin(np.clip(SIN_ALPHA * sin_phi - COS_ALPHA * cos_phi * cos_lam, -1, 1))
    lam_adams = BETA + np.arctan2(
        cos_phi * sin_lam,
        SIN_ALPHA * cos_phi * cos_lam + COS_ALPHA * sin_phi,
    )
    lam_adams = (lam_adams + math.pi) % (2 * math.pi) - math.pi
    x_adams, y_adams = ADAMS(lam_adams, phi_adams, radians=True)
    cos_rot = math.cos(ROTATION)
    sin_rot = math.sin(ROTATION)
    scale = math.sqrt(2)
    x = -(x_adams * cos_rot + y_adams * sin_rot) * scale
    y = -(-x_adams * sin_rot + y_adams * cos_rot) * scale
    return np.asarray(x), np.asarray(y)


def to_pixels(x: np.ndarray | float, y: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
    px = (np.asarray(x) + EXTENT) / (2 * EXTENT) * (SIZE - 1)
    py = (EXTENT - np.asarray(y)) / (2 * EXTENT) * (SIZE - 1)
    return px, py


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


def projected_density(period: str) -> np.ndarray:
    values, west, north, lon_step, lat_step = read_tiff(period)
    rows, cols = np.nonzero(values < 999999)
    weights = np.log1p(values[rows, cols].astype(np.float32))
    lon = west + cols * lon_step
    lat = north - rows * lat_step
    x, y = project(lon, lat)
    px, py = to_pixels(x, y)
    px = np.rint(px).astype(np.int32)
    py = np.rint(py).astype(np.int32)
    inside = (px >= 0) & (px < SIZE) & (py >= 0) & (py < SIZE)
    field = np.zeros((SIZE, SIZE), dtype=np.float32)
    np.maximum.at(field, (py[inside], px[inside]), weights[inside])
    cap = float(np.quantile(field[field > 0], 0.997))
    normalized = np.clip(field / max(cap, 1e-6), 0, 1)
    soft = np.asarray(
        Image.fromarray((normalized * 255).astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(1.25)),
        dtype=np.float32,
    ) / 255
    return soft


def colorize(field: np.ndarray, path: Path) -> None:
    strength = np.power(field, 0.62)
    core = np.clip((field - 0.68) / 0.32, 0, 1)
    rgb = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    rgb[..., 0] = (42 + core * 205).astype(np.uint8)
    rgb[..., 1] = (181 + core * 74).astype(np.uint8)
    rgb[..., 2] = (192 + core * 63).astype(np.uint8)
    rgb[..., 3] = (strength * 232).astype(np.uint8)
    glow = Image.fromarray(rgb, "RGBA").filter(ImageFilter.GaussianBlur(2.6))
    crisp = Image.fromarray(rgb, "RGBA")
    Image.alpha_composite(glow, crisp).save(path, "WEBP", quality=80, method=4)


def change_image(earlier: np.ndarray, later: np.ndarray, path: Path) -> None:
    stable = np.minimum(earlier, later)
    warm = np.clip(earlier - later, 0, 1)
    cool = np.clip(later - earlier, 0, 1)
    alpha = np.power(np.maximum.reduce([stable, warm, cool]), 0.58)
    total = stable + warm + cool + 1e-6
    rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    rgba[..., 0] = ((stable * 232 + warm * 242 + cool * 44) / total).astype(np.uint8)
    rgba[..., 1] = ((stable * 247 + warm * 182 + cool * 216) / total).astype(np.uint8)
    rgba[..., 2] = ((stable * 240 + warm * 109 + cool * 224) / total).astype(np.uint8)
    rgba[..., 3] = (alpha * 235).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").filter(ImageFilter.GaussianBlur(1.1)).save(path, "WEBP", quality=82, method=4)


def iter_rings(geometry: dict):
    coordinates = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        yield from coordinates
    elif geometry["type"] == "MultiPolygon":
        for polygon in coordinates:
            yield from polygon


def coastline_image(path: Path) -> None:
    source = json.loads(GEOMETRY.read_text())
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    for feature in source["features"]:
        for ring in iter_rings(feature["geometry"]):
            if len(ring) < 2:
                continue
            coords = np.asarray(ring, dtype=np.float64)
            x, y = project(coords[:, 0], coords[:, 1])
            px, py = to_pixels(x, y)
            segment: list[tuple[float, float]] = []
            previous: tuple[float, float] | None = None
            for point in zip(px.tolist(), py.tolist()):
                if previous is not None and math.dist(point, previous) > SIZE * 0.17:
                    if len(segment) > 1:
                        draw.line(segment, fill=(94, 116, 119, 118), width=1, joint="curve")
                    segment = []
                segment.append(point)
                previous = point
            if len(segment) > 1:
                draw.line(segment, fill=(94, 116, 119, 118), width=1, joint="curve")
    canvas.save(path, "WEBP", quality=84, method=4)


def monthly_corridors(path: Path) -> None:
    wanted = set(CORRIDORS)
    buckets: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    for page in sorted(glob.glob(str(PORTWATCH / "daily-chokepoints-page-*.json"))):
        for feature in json.loads(Path(page).read_text()).get("features", []):
            attrs = feature["attributes"]
            if attrs["portid"] in wanted:
                buckets[attrs["portid"]][attrs["date"][:7]].append(int(attrs.get("n_cargo") or 0))

    records = []
    for port_id, meta in CORRIDORS.items():
        x, y = project(meta["lon"], meta["lat"])
        px, py = to_pixels(x, y)
        series = [
            {"period": period, "dailyAverage": round(sum(values) / len(values), 1)}
            for period, values in sorted(buckets[port_id].items())
        ]
        records.append({
            "id": port_id,
            **meta,
            "x": round(float(px) / (SIZE - 1) * 100, 4),
            "y": round(float(py) / (SIZE - 1) * 100, 4),
            "series": series,
        })
    path.write_text(json.dumps({"corridors": records}, separators=(",", ":")))


def build_period(period: str) -> str:
    field = projected_density(period)
    colorize(field, OUTPUT / f"flow-{period}.webp")
    return period


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Build every downloaded monthly global period")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    periods = tuple(path.stem for path in sorted(GFW.glob("*.zip"))) if args.all else DEMO_PERIODS
    if args.all:
        with ProcessPoolExecutor(max_workers=max(1, min(args.workers, 6))) as executor:
            for completed in executor.map(build_period, periods):
                print(f"built {completed}", flush=True)
    else:
        for period in periods:
            build_period(period)
    earlier = projected_density(periods[0])
    later = projected_density(periods[-1])
    change_image(earlier, later, OUTPUT / "change-2012-2026.webp")
    coastline_image(OUTPUT / "coastlines.webp")
    monthly_corridors(OUTPUT / "corridors.json")
    manifest = {
        "title": "Passage",
        "periods": list(periods),
        "projection": "Spilhaus ocean map in square (ESRI:54099 parameters)",
        "metric": "Monthly cargo-vessel AIS presence, 6–25 knots",
        "source": "Global Fishing Watch public-global-presence:v4.0",
        "draft": True,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
