#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$project_root/.env.local"
output_dir="$project_root/data/raw/global-fishing-watch/downloads/corridor-high"
endpoint="https://gateway.api.globalfishingwatch.org/v3/4wings/report"
last_report_endpoint="https://gateway.api.globalfishingwatch.org/v3/4wings/last-report"
year="${1:?Pass one year from 2012 through 2026}"

if (( year < 2012 || year > 2026 )); then
  echo "Year must be between 2012 and 2026" >&2
  exit 2
fi

token_value="$(sed -n 's/^GFW_API_ACCESS_TOKEN=//p' "$env_file" | tr -d '\r')"
if [[ -z "$token_value" || "$token_value" == "replace_with_your_personal_token" ]]; then
  echo "Global Fishing Watch access token is missing" >&2
  exit 1
fi

mkdir -p "$output_dir"
final_file="$output_dir/all-corridors-${year}-monthly-high-csv.zip"
partial_file="${final_file}.part"
last_file="${partial_file}.last"

if [[ -f "$final_file" ]] && unzip -tq "$final_file" >/dev/null 2>&1; then
  echo "Combined $year archive already verified"
  exit 0
fi

start_date="${year}-01-01"
if (( year == 2026 )); then
  end_date="2026-08-01"
else
  end_date="$((year + 1))-01-01"
fi

request_url="${endpoint}?spatial-resolution=HIGH&temporal-resolution=MONTHLY&spatial-aggregation=false&group-by=FLAG&datasets%5B0%5D=public-global-presence%3Av4.0&format=CSV&filters%5B0%5D=vessel_type%20%3D%20%22cargo%22%20AND%20speed%20in%20%28%226-10%22%2C%2210-15%22%2C%2215-25%22%29&date-range=${start_date}%2C${end_date}"
request_body='{"geojson":{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"id":"suez"},"geometry":{"type":"Polygon","coordinates":[[[31.1,28.7],[34.2,28.7],[34.2,32.0],[31.1,32.0],[31.1,28.7]]]}},{"type":"Feature","properties":{"id":"panama"},"geometry":{"type":"Polygon","coordinates":[[[-81.0,7.7],[-78.2,7.7],[-78.2,10.2],[-81.0,10.2],[-81.0,7.7]]]}},{"type":"Feature","properties":{"id":"bab-el-mandeb"},"geometry":{"type":"Polygon","coordinates":[[[41.5,10.7],[45.0,10.7],[45.0,14.2],[41.5,14.2],[41.5,10.7]]]}},{"type":"Feature","properties":{"id":"malacca"},"geometry":{"type":"Polygon","coordinates":[[[98.2,0.0],[104.8,0.0],[104.8,7.2],[98.2,7.2],[98.2,0.0]]]}},{"type":"Feature","properties":{"id":"hormuz"},"geometry":{"type":"Polygon","coordinates":[[[54.0,24.2],[58.8,24.2],[58.8,28.2],[54.0,28.2],[54.0,24.2]]]}},{"type":"Feature","properties":{"id":"cape"},"geometry":{"type":"Polygon","coordinates":[[[14.8,-37.5],[23.0,-37.5],[23.0,-30.5],[14.8,-30.5],[14.8,-37.5]]]}}]}}'

echo "Requesting the six high-resolution corridors for $year"
status_code="$(curl --silent --show-error --location --request POST "$request_url" \
  --header "Authorization: Bearer $token_value" \
  --header "Content-Type: application/json" \
  --data-raw "$request_body" \
  --output "$partial_file" \
  --write-out '%{http_code}' || true)"

if [[ "$status_code" == "200" ]] && unzip -tq "$partial_file" >/dev/null 2>&1; then
  mv "$partial_file" "$final_file"
  echo "Downloaded and verified combined $year archive"
  exit 0
fi

if [[ "$status_code" != "200" && "$status_code" != "429" && "$status_code" != "000" && "$status_code" != 5* ]]; then
  echo "Combined report request failed with HTTP $status_code" >&2
  exit 1
fi

for poll_number in $(seq 1 120); do
  echo "Combined report active; waiting 15 seconds before poll $poll_number/120"
  sleep 15
  poll_status="$(curl --silent --show-error --location "$last_report_endpoint" \
    --header "Authorization: Bearer $token_value" \
    --output "$last_file" \
    --write-out '%{http_code}' || true)"
  if [[ "$poll_status" == "200" ]] && unzip -tq "$last_file" >/dev/null 2>&1; then
    mv "$last_file" "$final_file"
    rm -f "$partial_file"
    echo "Downloaded and verified combined $year archive"
    exit 0
  fi
  if [[ "$poll_status" == "200" ]] && jq -e '.status == "running"' "$last_file" >/dev/null 2>&1; then
    continue
  fi
  echo "Combined high-resolution report ended without an archive" >&2
  exit 1
done

echo "Combined report did not finish within the polling window" >&2
exit 1
