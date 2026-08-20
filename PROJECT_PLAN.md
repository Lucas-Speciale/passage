# Passage — project plan

## Product

Passage is an interactive atlas of how large commercial-shipping routes occupy the ocean and change through time. The route network is the subject—not traded goods, individual-vessel surveillance, or a claim that raw AIS counts equal global trade volume.

Visitors should be able to:

1. explore a global cargo-route density field from January 2012 through July 2026;
2. scrub or play through monthly fields with continuous visual transitions;
3. compare each month with the same month one year earlier;
4. select a major passage, enter a close regional view, and keep the map moving;
5. read that passage’s timeline-linked PortWatch transit estimate from 2019 onward;
6. read the changing route fields without implying that animated marks are identifiable ships.

## Visual direction

The overview is a continuously wrapping flat Web Mercator ocean map. OpenFreeMap vector tiles keep coastlines, country boundaries, and country labels sharp at every supported zoom while preserving Pacific continuity without repeating Displacement Globe’s sphere. Default inland settlement labels are removed; a curated local layer names only shipping-relevant coastal cities.

The portfolio family remains visible through the same Inter UI type, Georgia editorial display type, compact uppercase labels, ink/charcoal foundation, terracotta selection accent, restrained panels, focus rings, and reduced-motion support. Passage’s signature palette is deep ocean, matte land, luminous cyan routes, and amber prior-period change.

## Interaction model

- **Flow:** log-scaled AIS cargo presence for the selected month. Adjacent months are stacked and crossfaded as a fractional timeline advances.
- **Change:** a rolling same-month year-over-year comparison. Amber means stronger in the prior year, cyan means stronger in the selected year, and pale overlap indicates persistence. Playback remains in Change mode.
- **Passage focus:** selecting Suez, Panama, Bab el-Mandeb, Malacca, Hormuz, or the Cape route calculates a region-filling zoom from that passage’s geographic bounds and switches to its 0.01° monthly detail field.
- **Corridor fingerprint:** a selected passage can switch from its transit chart to a 2012–2026 time-by-route profile. Each vertical slice is one month compressed across the passage’s principal route axis; dragging the shared playhead updates the map.
- **Passage chart:** the selected PortWatch series uses the same current month as the map, with a moving playhead, daily cargo-transit estimate, and same-month prior-year change.
- **Map navigation:** MapLibre supplies cursor-anchored zoom, inertial panning, native trackpad gestures, continuous horizontal world copies, passage `fitBounds`, and whole-world reset behavior.

## Data roles

| Source | Coverage | Role | Local status |
|---|---|---|---|
| Global Fishing Watch `public-global-presence:v4.0` | monthly, 0.1° global, Jan 2012–Jul 2026 | cargo route surface, filtered to 6–25 knots | 175 verified reports and 175 deployable 2,048 × 2,048 Web Mercator textures |
| IMF PortWatch Daily Chokepoints | daily, Jan 2019–Aug 16 2026 | passage transit histories | 77,980 observations across 28 chokepoints; six exposed in Draft 2 |
| GFW high-resolution report API | 0.01°, maximum 366 days/request | monthly named-passage detail textures | six passage polygons combined into 15 serial yearly reports; browser output is aggregated and identity-free |
| World Bank/IMF commercial shipping density | cumulative, 2015–2021 | high-resolution reference and QA | source archive verified locally; not shipped to the browser |

Presence is standardized hourly AIS presence, not unique vessels or tonnage. PortWatch transit counts are a separate metric and are never merged with GFW intensity into one absolute measure.

## Architecture

Passage follows the existing portfolio architecture: Next.js 16, React 19, strict TypeScript, static export, offline Python preparation, and compact browser-ready assets in `public/data/passage/`. It adds no runtime API, database, account system, or subscription dependency.

```text
verified local GFW + PortWatch snapshots
                  |
        offline Python aggregation
                  |
  validate -> colorize -> reproject -> WebP + vector spine + compact JSON
                  |
        public/data/passage/
                  |
        Next.js static export
```

MapLibre provides the continuous flat vector basemap, high-fidelity borders and labels, and exact cursor-centered camera behavior. Local monthly AIS textures remain the temporal signal. A generated 0.44 MB GeoJSON route spine supplies crisp close-zoom geometry outside the six named passages; the passage textures retain exact 0.01° detail. This avoids shipping a global 500 m raster pyramid while keeping all project data static and cacheable.

Key files:

- `src/components/PassageExplorer.tsx`: exploration state, interpolation, passage panel, timeline.
- `src/components/PassageMap.tsx`: MapLibre camera, vector basemap, country/coastal-city labels, route imagery, route spine, and passage detail layers.
- `src/lib/passage.ts`: date and chart helpers.
- `scripts/build_world_data.py`: 0.1° global texture build.
- `scripts/reproject_world_routes.py`: converts global fields to square Web Mercator textures.
- `scripts/build_route_network.py`: extracts the compact, zoom-safe global route spine.
- `scripts/acquire_all_gfw_combined_high.sh`: one-active-report, rate-limit-conscious 0.01° acquisition for six passage regions.
- `scripts/build_corridor_detail.py`: strips vessel identity fields and emits aggregated monthly detail textures.
- `scripts/build_corridor_fingerprints.py`: derives the six compact transverse time profiles from the published identity-free detail textures.
- `public/data/passage/manifest.json`: available months, projection, metric, and asset contract.

## Performance contract

- Never request the full monthly archive at startup.
- Load the selected and next monthly field; Change also loads their prior-year counterparts.
- Use MapLibre world copies rather than duplicating route DOM.
- Stream basemap vectors from OpenFreeMap and keep the deployable project data local.
- Keep raw GeoTIFFs, raw high-resolution CSVs, vessel identifiers, and PortWatch source pages outside the static export.
- Preserve a static map and functional timeline if animation is disabled.

## Current milestone: Draft 3

Completed:

- full 175-month global timeline;
- continuous vector world map with no empty horizontal edges;
- crisp country borders and labels at every supported zoom;
- curated shipping-relevant coastal-city labels with inland settlement clutter removed;
- compact vector route geometry for sharp deep zoom outside named passages;
- fractional month crossfades;
- playable rolling Change mode;
- deep passage focus;
- six interactive, timeline-linked corridor fingerprints;
- six timeline-linked PortWatch passage charts;
- responsive UI, tests, lint, and static build.

Next candidates after visual review:

- evaluate whether more named passages merit 0.01° local textures;
- add URL-shareable state;
- validate color-blind Change encodings and reduced-motion stepping;
- consider a passage-to-alternative comparison (for example Suez versus Cape) before adding freehand gates or more controls.
