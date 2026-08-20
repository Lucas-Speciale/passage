#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$project_root/.env.local"
output_dir="$project_root/data/raw/global-fishing-watch/downloads/corridor-high"
endpoint="https://gateway.api.globalfishingwatch.org/v3/4wings/report"
last_report_endpoint="https://gateway.api.globalfishingwatch.org/v3/4wings/last-report"

if [[ ! -f "$env_file" ]]; then
  echo "Missing local API credentials" >&2
  exit 1
fi

token_value="$(sed -n 's/^GFW_API_ACCESS_TOKEN=//p' "$env_file" | tr -d '\r')"
if [[ -z "$token_value" || "$token_value" == "replace_with_your_personal_token" ]]; then
  echo "Global Fishing Watch access token is missing" >&2
  exit 1
fi

corridor="${1:-suez}"
year="${2:-2026}"
report_format="${3:-CSV}"
if [[ "$report_format" != "CSV" && "$report_format" != "TIF" ]]; then
  echo "Format must be CSV or TIF" >&2
  exit 2
fi
if (( year < 2012 || year > 2026 )); then
  echo "Year must be between 2012 and 2026" >&2
  exit 2
fi
case "$corridor" in
  suez) bounds='[[31.1,28.7],[34.2,28.7],[34.2,32.0],[31.1,32.0],[31.1,28.7]]' ;;
  panama) bounds='[[-81.0,7.7],[-78.2,7.7],[-78.2,10.2],[-81.0,10.2],[-81.0,7.7]]' ;;
  bab-el-mandeb) bounds='[[41.5,10.7],[45.0,10.7],[45.0,14.2],[41.5,14.2],[41.5,10.7]]' ;;
  malacca) bounds='[[98.2,0.0],[104.8,0.0],[104.8,7.2],[98.2,7.2],[98.2,0.0]]' ;;
  hormuz) bounds='[[54.0,24.2],[58.8,24.2],[58.8,28.2],[54.0,28.2],[54.0,24.2]]' ;;
  cape) bounds='[[14.8,-37.5],[23.0,-37.5],[23.0,-30.5],[14.8,-30.5],[14.8,-37.5]]' ;;
  *) echo "Unknown corridor: $corridor" >&2; exit 2 ;;
esac

mkdir -p "$output_dir"
start_date="${year}-01-01"
if (( year == 2026 )); then
  end_date="2026-08-01"
else
  end_date="$((year + 1))-01-01"
fi
format_slug="$(printf '%s' "$report_format" | tr '[:upper:]' '[:lower:]')"
final_file="$output_dir/${corridor}-${year}-monthly-high-${format_slug}.zip"
partial_file="${final_file}.part"
last_file="${partial_file}.last"

if [[ -f "$final_file" ]] && unzip -tq "$final_file" >/dev/null 2>&1; then
  echo "$corridor high-resolution archive already verified"
  exit 0
fi

request_url="${endpoint}?spatial-resolution=HIGH&temporal-resolution=MONTHLY&spatial-aggregation=false&datasets%5B0%5D=public-global-presence%3Av4.0&format=${report_format}&filters%5B0%5D=vessel_type%20%3D%20%22cargo%22%20AND%20speed%20in%20%28%226-10%22%2C%2210-15%22%2C%2215-25%22%29&date-range=${start_date}%2C${end_date}"
request_body="{\"geojson\":{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"properties\":{},\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[${bounds}]}}]}}"

echo "Requesting one serial high-resolution report for $corridor in $year"
status_code="$(curl --silent --show-error --location --request POST "$request_url" \
  --header "Authorization: Bearer $token_value" \
  --header "Content-Type: application/json" \
  --data-raw "$request_body" \
  --output "$partial_file" \
  --write-out '%{http_code}' || true)"

if [[ "$status_code" == "200" ]] && unzip -tq "$partial_file" >/dev/null 2>&1; then
  mv "$partial_file" "$final_file"
  echo "Downloaded and verified $corridor high-resolution archive"
  exit 0
fi

if [[ "$status_code" != "200" && "$status_code" != "429" && "$status_code" != "000" && "$status_code" != 5* ]]; then
  echo "Report request failed with HTTP $status_code" >&2
  exit 1
fi

for poll_number in $(seq 1 30); do
  echo "Report active; waiting 60 seconds before poll $poll_number/30"
  sleep 60
  poll_status="$(curl --silent --show-error --location "$last_report_endpoint" \
    --header "Authorization: Bearer $token_value" \
    --output "$last_file" \
    --write-out '%{http_code}' || true)"
  if [[ "$poll_status" == "200" ]] && unzip -tq "$last_file" >/dev/null 2>&1; then
    mv "$last_file" "$final_file"
    rm -f "$partial_file"
    echo "Downloaded and verified $corridor high-resolution archive"
    exit 0
  fi
  if [[ "$poll_status" == "200" ]] && jq -e '.status == "running"' "$last_file" >/dev/null 2>&1; then
    continue
  fi
  echo "High-resolution report ended without an archive" >&2
  exit 1
done

echo "High-resolution report did not finish within the polling window" >&2
exit 1
