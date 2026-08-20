# IMF PortWatch daily chokepoint snapshot

Downloaded on 2026-08-20 from the public IMF PortWatch ArcGIS service.

- Platform: https://portwatch.imf.org/
- Source service: https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services/Daily_Chokepoints_Data/FeatureServer/0
- Terms: https://www.imf.org/external/terms.htm
- Recommended attribution: “Sources: UN Global Platform; IMF PortWatch (portwatch.imf.org).”

## Snapshot contents

- `daily-chokepoints-service.json` — source schema and service metadata.
- `daily-chokepoints-count.json` — source record count at acquisition.
- `daily-chokepoints-page-*.json` — 78 ordered source pages, fetched with `resultRecordCount=1000` and increasing `resultOffset`.
- `SHA256SUMS` — integrity hashes for the service metadata, count response, and every page.

Validation on acquisition:

- 77,980 records
- 28 named chokepoints
- 2019-01-01 through 2026-08-16
- zero page-level API errors

Useful fields include daily counts for containers, dry bulk, general cargo, Ro-Ro, tankers, all cargo, and all transits, plus corresponding estimated carrying capacities.

## Intended use and caveat

This is the authoritative time series for named corridor panels and comparisons. It does not provide full vessel tracks. Recent observations can be revised as AIS coverage and PortWatch methodology improve, so the build must surface the snapshot date and must not imply that the series is official customs trade.

