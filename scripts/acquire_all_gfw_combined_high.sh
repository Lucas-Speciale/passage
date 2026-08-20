#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Acquiring 15 serial reports; the API permits one active report per token"
for year in $(seq 2012 2026); do
  bash "$project_root/scripts/acquire_gfw_combined_high.sh" "$year"
done

(
  cd "$project_root/data/raw/global-fishing-watch/downloads/corridor-high"
  shasum -a 256 ./all-corridors-*-monthly-high-csv.zip > COMBINED_SHA256SUMS
)

echo "Downloaded and verified all 15 combined corridor reports"
