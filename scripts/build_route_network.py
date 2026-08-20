#!/usr/bin/env python3
"""Extract a compact, zoom-safe line network from the global monthly route fields.

The monthly WebP fields remain the temporal signal. This file supplies a stable
vector spine at close zoom so open-ocean routes stay crisp instead of exposing
the pixels of the 0.1-degree global AIS grid.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.morphology import remove_small_objects, skeletonize


ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / "public" / "data" / "passage" / "world"
OUTPUT = WORLD / "network.geojson"
SAMPLE_STEP = 6
THRESHOLD = 100
MIN_COMPONENT = 20
MIN_PATH = 5

NEIGHBORS = (
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1),           (0, 1),
    (1, -1),  (1, 0),  (1, 1),
)


def aggregate() -> np.ndarray:
    files = sorted(WORLD.glob("route-*.webp"))[::SAMPLE_STEP]
    if not files:
        raise SystemExit("No monthly world route fields were found.")
    with Image.open(files[0]) as sample:
        shape = (sample.height, sample.width)
    mean = np.zeros(shape, dtype=np.float32)
    peak = np.zeros_like(mean)
    for path in files:
        alpha = np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)[..., 3]
        mean += alpha
        np.maximum(peak, alpha, out=peak)
    mean /= len(files)
    return mean * 0.65 + peak * 0.35


def rdp(points: list[tuple[int, int]], tolerance: float = 0.8) -> list[tuple[int, int]]:
    if len(points) <= 2:
        return points
    start = np.array(points[0], dtype=np.float32)
    end = np.array(points[-1], dtype=np.float32)
    vector = end - start
    points_array = np.asarray(points, dtype=np.float32)
    if np.allclose(vector, 0):
        distances = np.linalg.norm(points_array - start, axis=1)
    else:
        relative = points_array - start
        distances = np.abs(vector[0] * relative[:, 1] - vector[1] * relative[:, 0]) / np.linalg.norm(vector)
    index = int(np.argmax(distances))
    if distances[index] <= tolerance:
        return [points[0], points[-1]]
    return rdp(points[:index + 1], tolerance)[:-1] + rdp(points[index:], tolerance)


def trace_paths(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    rows, columns = mask.shape
    points = set(zip(*np.nonzero(mask), strict=True))

    def adjacent(point: tuple[int, int]):
        row, column = point
        for dr, dc in NEIGHBORS:
            candidate = (row + dr, column + dc)
            if 0 <= candidate[0] < rows and 0 <= candidate[1] < columns and candidate in points:
                yield candidate

    degrees = {point: sum(1 for _ in adjacent(point)) for point in points}
    visited: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    paths: list[list[tuple[int, int]]] = []

    def edge(a: tuple[int, int], b: tuple[int, int]):
        return (a, b) if a < b else (b, a)

    def walk(start: tuple[int, int], following: tuple[int, int]):
        path = [start, following]
        visited.add(edge(start, following))
        previous, current = start, following
        while degrees[current] == 2:
            candidates = [point for point in adjacent(current) if point != previous]
            if not candidates:
                break
            next_point = candidates[0]
            next_edge = edge(current, next_point)
            if next_edge in visited:
                break
            visited.add(next_edge)
            path.append(next_point)
            previous, current = current, next_point
        return path

    for point in points:
        if degrees[point] == 2:
            continue
        for neighbor in adjacent(point):
            if edge(point, neighbor) not in visited:
                paths.append(walk(point, neighbor))

    for point in points:
        for neighbor in adjacent(point):
            if edge(point, neighbor) not in visited:
                paths.append(walk(point, neighbor))
    return paths


def coordinate(point: tuple[int, int], width: int, height: int) -> list[float]:
    row, column = point
    longitude = column / (width - 1) * 360 - 180
    if width == height:
        latitude = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * row / (height - 1)))))
    else:
        latitude = 90 - row / (height - 1) * 180
    return [round(longitude, 4), round(float(latitude), 4)]


def main() -> None:
    field = aggregate()
    mask = remove_small_objects(field >= THRESHOLD, max_size=MIN_COMPONENT - 1)
    skeleton = skeletonize(mask)
    height, width = field.shape
    features = []
    for raw_path in trace_paths(skeleton):
        if len(raw_path) < MIN_PATH:
            continue
        path = rdp(raw_path)
        if len(path) < 2:
            continue
        strength = float(np.mean([field[row, column] for row, column in raw_path]))
        features.append({
            "type": "Feature",
            "properties": {"strength": round(max(0, min(1, (strength - THRESHOLD) / 155)), 3)},
            "geometry": {
                "type": "LineString",
                "coordinates": [coordinate(point, width, height) for point in path],
            },
        })
    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    print(f"wrote {len(features):,} route paths to {OUTPUT} ({OUTPUT.stat().st_size / 1_000_000:.2f} MB)")


if __name__ == "__main__":
    main()
