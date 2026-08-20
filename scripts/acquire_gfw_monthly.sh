#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$project_root/.env.local"
output_dir="$project_root/data/raw/global-fishing-watch/downloads/global-monthly-low"
endpoint="https://gateway.api.globalfishingwatch.org/v3/4wings/report"
last_report_endpoint="https://gateway.api.globalfishingwatch.org/v3/4wings/last-report"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file" >&2
  exit 1
fi

token_value="$(sed -n 's/^GFW_API_ACCESS_TOKEN=//p' "$env_file" | tr -d '\r')"
if [[ -z "$token_value" || "$token_value" == "replace_with_your_personal_token" ]]; then
  echo "GFW_API_ACCESS_TOKEN is missing from $env_file" >&2
  exit 1
fi

mkdir -p "$output_dir"

request_url="${endpoint}?spatial-resolution=LOW&temporal-resolution=MONTHLY&spatial-aggregation=false&datasets%5B0%5D=public-global-presence%3Alatest&format=TIF&filters%5B0%5D=vessel_type%20%3D%20%22cargo%22%20AND%20speed%20in%20%28%226-10%22%2C%2210-15%22%2C%2215-25%22%29"
request_body='{"geojson":{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-179.9,-85],[179.9,-85],[179.9,85],[-179.9,85],[-179.9,-85]]]}}]}}'

wait_for_active_report() {
  local period="$1"
  local partial_file="$2"
  local last_file="${partial_file}.last"
  local response_meta
  local status_code

  for poll_number in $(seq 1 30); do
    echo "  $period report still active; cooling down for 60 seconds (poll $poll_number/30)"
    sleep 60

    response_meta="$(curl \
      --silent \
      --show-error \
      --location \
      "$last_report_endpoint" \
      --header "Authorization: Bearer $token_value" \
      --output "$last_file" \
      --write-out '%{http_code}' || true)"
    status_code="${response_meta:-000}"

    if [[ "$status_code" == "200" ]] && unzip -tq "$last_file" >/dev/null 2>&1; then
      mv "$last_file" "$partial_file"
      return 0
    fi

    if [[ "$status_code" == "200" ]] && jq -e '.status == "running"' "$last_file" >/dev/null 2>&1; then
      continue
    fi

    if [[ "$status_code" == "200" ]] && jq -e '.status != "running"' "$last_file" >/dev/null 2>&1; then
      report_status="$(jq -r '.status // .message.statusCode // "unknown"' "$last_file")"
      echo "  $period active report finished without an archive (status $report_status)"
      return 2
    fi

    if [[ "$status_code" == "404" ]]; then
      return 2
    fi

    echo "  $period last-report status was $status_code; continuing cooldown"
  done

  return 1
}

start_year=2012
start_month=1
end_year=2026
end_month=7
total=$(( (end_year - start_year) * 12 + end_month - start_month + 1 ))
completed=0

for ((year = start_year; year <= end_year; year++)); do
  first_month=1
  last_month=12
  if (( year == start_year )); then
    first_month=$start_month
  fi
  if (( year == end_year )); then
    last_month=$end_month
  fi

  for ((month = first_month; month <= last_month; month++)); do
    completed=$((completed + 1))
    period="$(printf '%04d-%02d' "$year" "$month")"
    if (( month == 12 )); then
      next_period="$(printf '%04d-01' "$((year + 1))")"
    else
      next_period="$(printf '%04d-%02d' "$year" "$((month + 1))")"
    fi

    final_file="$output_dir/${period}.zip"
    partial_file="$output_dir/.${period}.part"

    if [[ -f "$final_file" ]] && unzip -tq "$final_file" >/dev/null 2>&1; then
      echo "[$completed/$total] $period already verified"
      continue
    fi

    submission_number=0
    while true; do
      submission_number=$((submission_number + 1))
      echo "[$completed/$total] downloading $period (submission $submission_number/3)"

      response_meta="$(curl \
        --silent \
        --show-error \
        --location \
        --request POST \
        "${request_url}&date-range=${period}-01%2C${next_period}-01" \
        --header "Authorization: Bearer $token_value" \
        --header "Content-Type: application/json" \
        --data-raw "$request_body" \
        --output "$partial_file" \
        --write-out '%{http_code}' || true)"
      status_code="${response_meta:-000}"

      if [[ "$status_code" == "200" ]] && unzip -tq "$partial_file" >/dev/null 2>&1; then
        break
      fi

      if [[ "$status_code" == "429" || "$status_code" == "000" || "$status_code" == 5* ]]; then
        echo "  $period submission returned $status_code; checking the active report without resubmitting"
        if wait_for_active_report "$period" "$partial_file"; then
          break
        fi
      else
        echo "  $period failed with non-retryable HTTP status $status_code" >&2
        exit 1
      fi

      if (( submission_number >= 3 )); then
        echo "  $period did not complete after three spaced submissions" >&2
        exit 1
      fi

      echo "  $period has no active report; waiting 60 seconds before resubmission"
      sleep 60
    done

    unzip -tq "$partial_file" >/dev/null
    mv "$partial_file" "$final_file"
  done
done

(
  cd "$output_dir"
  shasum -a 256 ./*.zip > SHA256SUMS
)

echo "Downloaded and verified $total monthly reports in $output_dir"
