#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Using the combined serial acquisition path; Global Fishing Watch permits one active report per token"
exec bash "$project_root/scripts/acquire_all_gfw_combined_high.sh"
