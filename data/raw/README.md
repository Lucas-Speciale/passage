# Raw data inventory

This folder contains immutable source snapshots and their provenance. Raw files are intentionally ignored by Git; only validated, identity-free derivatives are published from `public/data/passage/`.

## Present now

| Source | Local location | Role | Status |
|---|---|---|---|
| World Bank / IMF Global Shipping Traffic Density | `world-bank/` | High-resolution 2015–2021 commercial-shipping baseline | Downloaded and verified |
| IMF PortWatch Daily Chokepoints Data | `portwatch/` | Daily corridor transit counts from 2019 onward | Downloaded and verified |
| Global Fishing Watch AIS Vessel Presence v4.0 | `global-fishing-watch/downloads/global-monthly-low/` | Monthly global moving-cargo route surfaces from 2012 onward | 175 monthly reports downloaded and verified through 2026-07 |

The World Bank raster is a cumulative historical baseline, not a time series. PortWatch observes passage activity at named chokepoints but does not describe the full route between them. Global Fishing Watch supplies the continuous, changing route surface.
