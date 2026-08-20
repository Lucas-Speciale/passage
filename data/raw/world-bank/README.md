# World Bank / IMF commercial shipping-density snapshot

Downloaded on 2026-08-20 from the World Bank Data Catalog.

- Catalog: https://datacatalog.worldbank.org/search/dataset/0037580/global-shipping-traffic-density
- Direct source object: https://datacatalogfiles.worldbank.org/ddh-published/0037580/DR0045405/shipdensity_commercial_.zip
- License: Creative Commons Attribution 4.0
- Recommended attribution: “Data source: IMF’s World Seaborne Trade Monitoring System (Cerdeiro, Komaromi, Liu and Saeed, 2020).”

## Files

- `shipdensity_commercial.zip` — 480,353,369 bytes; verified ZIP containing the GeoTIFF, overview, world file, and auxiliary metadata.
- `dataset-readme.txt` — source methodology note.
- `vessel-type-breakdown.txt` — source vessel-category definitions.
- `SHA256SUMS` — local integrity hashes.

Commercial vessels include container ships, bulk and general cargo, tankers, vehicle carriers, reefers, Ro-Ro cargo, and several service-vessel classes. The raster counts standardized hourly AIS observations in 0.005° cells from January 2015 through February 2021.

## Intended use and caveat

Use this raster to validate the shape and position of major commercial corridors, tune the Spilhaus projection, and provide a static fallback or “all years” reference. Do not use it to measure change over time: it is one cumulative surface, and it includes stationary as well as moving observations.

