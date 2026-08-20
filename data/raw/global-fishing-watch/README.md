# Global Fishing Watch AIS vessel-presence snapshot

Downloaded on 2026-08-20 through the authenticated Global Fishing Watch 4Wings Report API. The public documentation is at https://globalfishingwatch.org/our-apis/documentation and the dataset release note is at https://globalfishingwatch.org/platform-update/global-ais-vessel-presence-dataset/.

## Source snapshot

- Requested dataset: `public-global-presence:latest`
- Resolved dataset: `public-global-presence:v4.0`
- Local coverage: 2012-01 through 2026-07, the latest complete month at acquisition
- Signal: one standardized AIS position per vessel per hour
- Vessel filter: `vessel_type = 'cargo'`
- Moving-vessel filter: `speed in ('6-10','10-15','15-25')`
- Temporal unit: one report per calendar month
- Spatial resolution: low, 0.1°
- Region: global rectangle from 179.9°W to 179.9°E and 85°S to 85°N
- Format: ZIP containing a WGS84 GeoTIFF, query metadata, exact geometry, and GFW AIS caveat PDF
- Local storage: `downloads/global-monthly-low/`
- Archive count: 175
- Compressed size: approximately 242 MB
- Integrity: every ZIP passed `unzip -tq`; all 175 SHA-256 hashes are stored in `downloads/global-monthly-low/SHA256SUMS` and independently verified
- Attribution and use: retain Global Fishing Watch attribution and comply with its API terms and the source-specific license included with each report

## Acquisition and security

The API token is stored only in the Git-ignored, permission-restricted `.env.local` file. It is never printed, committed, placed in browser code, or copied into deployed assets. `scripts/acquire_gfw_monthly.sh` is serial, resumable, validates each archive before continuing, skips completed periods, and polls `last-report` after server timeouts rather than creating concurrent report jobs.

The production website will never call Global Fishing Watch at runtime. It will load only compact static derivatives produced by the offline pipeline.

## Pilot validation

The pilot files in this directory established the current API contract. A January 2024 global report produced a 3,599 × 1,560 float GeoTIFF. A Suez-area extract confirmed the v4.0 metadata, 0.1° resolution, categorical speed syntax, query geometry, and caveat packaging. These pilots are retained for projection and pipeline tests but are redundant with the monthly global archive.
