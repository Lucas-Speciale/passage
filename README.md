# Passage

Passage is a lightweight, static exploration of global commercial-shipping corridors through time. It combines 175 monthly cargo-presence fields from Global Fishing Watch (January 2012–July 2026) with selected IMF PortWatch chokepoint histories (2019 onward).

The map is a continuously wrapping flat vector world. Monthly density fields crossfade during playback; a compact vector route spine keeps ocean corridors sharp at close zoom, and selecting a named passage activates its exact 0.01° monthly field. Change mode is a rolling same-month, prior-year comparison.

## Local development

```bash
pnpm dev
pnpm test
pnpm lint
pnpm build
```

The development server runs on `http://localhost:3000`.

## Data build

Deployable assets live in `public/data/passage/`. Raw source snapshots remain under `data/raw/` and are never fetched by the browser. The page requests only the current, adjacent, and comparison textures—not the full archive.

Rebuild the deployable world and passage-detail textures with:

```bash
pnpm data:build:world
pnpm data:build:details
```

The global route textures are 2,048 × 2,048 Web Mercator WebP files derived from the local 0.1° GFW archive. Their shared zoom-safe route spine is a 0.44 MB GeoJSON file. Named-passage close-ups use separate 0.01° GFW fields, aggregated offline into identity-free monthly Web Mercator textures. Raw CSV reports and vessel identifiers remain local and are never part of the browser build.

The basemap uses OpenFreeMap vector tiles. Default inland settlement labels are suppressed; country labels remain globally available and a small local GeoJSON layer supplies shipping-relevant coastal-city names.
