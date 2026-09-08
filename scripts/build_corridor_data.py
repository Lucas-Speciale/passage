#!/usr/bin/env python3
"""Build monthly PortWatch histories for the six named shipping corridors."""

from __future__ import annotations

import glob
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "passage"
PORTWATCH = ROOT / "data" / "raw" / "portwatch"


CORRIDORS = {
    "chokepoint1": {"name": "Suez Canal", "short": "Suez", "lon": 32.55, "lat": 30.0, "note": "Europe–Asia hinge"},
    "chokepoint2": {"name": "Panama Canal", "short": "Panama", "lon": -79.68, "lat": 9.08, "note": "Atlantic–Pacific shortcut"},
    "chokepoint4": {"name": "Bab el-Mandeb Strait", "short": "Bab el-Mandeb", "lon": 43.32, "lat": 12.58, "note": "Red Sea southern gate"},
    "chokepoint5": {"name": "Malacca Strait", "short": "Malacca", "lon": 101.0, "lat": 2.5, "note": "Indian–Pacific hinge"},
    "chokepoint6": {"name": "Strait of Hormuz", "short": "Hormuz", "lon": 56.35, "lat": 26.55, "note": "Gulf export passage"},
    "chokepoint7": {"name": "Cape of Good Hope", "short": "Cape route", "lon": 18.48, "lat": -34.35, "note": "Suez alternative"},
}


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
        series = [
            {"period": period, "dailyAverage": round(sum(values) / len(values), 1)}
            for period, values in sorted(buckets[port_id].items())
        ]
        records.append({
            "id": port_id,
            **meta,
            "series": series,
        })
    path.write_text(json.dumps({"corridors": records}, separators=(",", ":")))



def main() -> None:
    if not list(PORTWATCH.glob("daily-chokepoints-page-*.json")):
        raise SystemExit("No local PortWatch daily snapshots were found.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    monthly_corridors(OUTPUT / "corridors.json")


if __name__ == "__main__":
    main()
