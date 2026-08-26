# Third-party notices

Passage combines original application code and visual design with the following third-party materials. The repository's `LICENSE` applies only to original materials and does not replace these terms.

## Global Fishing Watch vessel-presence data

The route textures, vector route network, and corridor fingerprints under `public/data/passage/` are derived from Global Fishing Watch `public-global-presence:v4.0` reports obtained through the 4Wings Report API.

- Source: [Global Fishing Watch public vessel-presence dataset](https://globalfishingwatch.org/platform-update/global-ais-vessel-presence-dataset/)
- Data license: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/), unless the source states otherwise
- Changes: Monthly presence rasters are filtered to the selected vessel and speed classes, reprojected, normalized, rendered as WebP textures, skeletonized into a shared route network, and compressed into named-corridor fingerprints. These outputs are aggregated and contain no vessel identifiers.

The GFW-derived data outputs remain subject to CC BY-SA 4.0, including its attribution and share-alike requirements.

## IMF PortWatch

Named-passage transit histories are derived from the public [IMF PortWatch](https://portwatch.imf.org/) Daily Chokepoints service.

- Recommended attribution: “Sources: UN Global Platform; IMF PortWatch (portwatch.imf.org).”
- Changes: Daily cargo-vessel transit estimates are mapped to six named passages and packaged with the static application. They remain a distinct series and are not used as vessel tracks or customs-trade observations.

IMF PortWatch is an open public platform, but this repository does not claim ownership of its source observations or grant additional rights over them. Users should consult PortWatch and IMF terms before independently redistributing those records.

## Geographic materials

- Country geometry: [World Bank Official Boundaries](https://datacatalog.worldbank.org/search/dataset/0038272/world-bank-official-boundaries), normalized for browser delivery
- Administrative lines: [Natural Earth](https://www.naturalearthdata.com/), public domain
- Map style and tiles: [OpenFreeMap](https://openfreemap.org/)
- Vector tile schema and styles: [OpenMapTiles](https://openmaptiles.org/)
- Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Rendering library: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)

Map attribution is also displayed in the application. JavaScript dependencies retain the licenses included with their respective packages.
