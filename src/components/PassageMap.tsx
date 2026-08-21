"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, ImageSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { formatPeriod } from "@/lib/passage";
import type { PassageStory } from "@/lib/stories";
import type { Corridor, PassageMode } from "@/types/passage";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const MAPLIBRE_WORKER_URL = "https://unpkg.com/maplibre-gl@6.4.0/dist/maplibre-gl-worker.mjs";
const WORLD_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, 85.05112878],
  [180, 85.05112878],
  [180, -85.05112878],
  [-180, -85.05112878],
];
const GLOBAL_SLOTS = ["current-lower", "current-upper", "earlier-lower", "earlier-upper"] as const;
const DETAIL_SLOTS = ["detail-current-lower", "detail-current-upper", "detail-earlier-lower", "detail-earlier-upper"] as const;
const SOURCE_IMAGE_KEYS = new WeakMap<MapLibreMap, Map<string, string>>();

export interface DetailConfig {
  slug: string;
  bounds: [number, number, number, number];
  size: [number, number];
  periods: string[];
}

interface PassageMapProps {
  corridors: Corridor[];
  selectedId: string;
  selectedDetail?: DetailConfig;
  detailActive: boolean;
  mode: PassageMode;
  lowerPeriod: string;
  upperPeriod: string;
  earlierLowerPeriod: string;
  earlierUpperPeriod: string;
  mix: number;
  activeStory: PassageStory | null;
  storySequence: number;
  onCorridorSelect: (id: string) => void;
  onZoomChange: (zoom: number) => void;
}

export interface PassageMapHandle {
  focusCorridor: (corridor: Corridor, detail?: DetailConfig) => void;
  reset: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  ensureStoryVisible: (lon: number, lat: number) => void;
}

function routeUrl(period: string) {
  return `/data/passage/world/route-${period}.webp`;
}

function detailUrl(detail: DetailConfig, period: string) {
  return `/data/passage/details/${detail.slug}/route-${period}.webp`;
}

function detailCoordinates(detail: DetailConfig): [[number, number], [number, number], [number, number], [number, number]] {
  const [west, south, east, north] = detail.bounds;
  return [[west, north], [east, north], [east, south], [west, south]];
}

function corridorData(corridors: Corridor[], selectedId: string): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: corridors.map((corridor) => ({
      type: "Feature",
      properties: {
        id: corridor.id,
        name: corridor.name,
        short: corridor.short,
        selected: corridor.id === selectedId ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [corridor.lon, corridor.lat] },
    })),
  };
}

function sourceImage(map: MapLibreMap, id: string, url: string, coordinates = WORLD_COORDINATES) {
  let keys = SOURCE_IMAGE_KEYS.get(map);
  if (!keys) {
    keys = new Map();
    SOURCE_IMAGE_KEYS.set(map, keys);
  }
  const key = `${url}|${coordinates.flat().join(",")}`;
  if (keys.get(id) === key) return;
  const source = map.getSource(id) as ImageSource | undefined;
  if (!source) return;
  keys.set(id, key);
  source.updateImage({ url, coordinates });
}

function periodSlot(prefix: string, period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${prefix}-${(year * 12 + month) % 2 === 0 ? "lower" : "upper"}`;
}

function updatePeriodPair({
  map,
  prefix,
  lowerPeriod,
  upperPeriod,
  lowerUrl,
  upperUrl,
  mix,
  visible,
  detailed = false,
  coordinates = WORLD_COORDINATES,
}: {
  map: MapLibreMap;
  prefix: string;
  lowerPeriod: string;
  upperPeriod: string;
  lowerUrl: string;
  upperUrl: string;
  mix: number;
  visible: boolean;
  detailed?: boolean;
  coordinates?: typeof WORLD_COORDINATES;
}) {
  const slots = [`${prefix}-lower`, `${prefix}-upper`];
  slots.forEach((slot) => {
    const layer = `${slot}-layer`;
    if (!map.getLayer(layer)) return;
    map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
    setRasterOpacity(map, layer, 0, detailed);
  });
  if (!visible) return;

  const lowerSlot = periodSlot(prefix, lowerPeriod);
  const upperSlot = periodSlot(prefix, upperPeriod);
  sourceImage(map, lowerSlot, lowerUrl, coordinates);
  if (lowerSlot === upperSlot) {
    setRasterOpacity(map, `${lowerSlot}-layer`, 1, detailed);
    return;
  }
  sourceImage(map, upperSlot, upperUrl, coordinates);
  setRasterOpacity(map, `${lowerSlot}-layer`, 1 - mix, detailed);
  setRasterOpacity(map, `${upperSlot}-layer`, mix, detailed);
}

function setRasterOpacity(map: MapLibreMap, id: string, amount: number, detailed = false) {
  if (!map.getLayer(id)) return;
  map.setPaintProperty(id, "raster-opacity", detailed
    ? ["interpolate", ["linear"], ["zoom"], 5.5, 0, 6.5, amount * 0.94, 12, amount]
    : ["interpolate", ["linear"], ["zoom"], 0, amount * 0.96, 3, amount * 0.72, 6, amount * 0.24, 9, amount * 0.08]);
}

function addRasterLayer(map: MapLibreMap, id: string, source: string, beforeId: string | undefined, warm = false, detailed = false) {
  map.addLayer({
    id,
    type: "raster",
    source,
    paint: {
      "raster-opacity": 0,
      "raster-fade-duration": 0,
      "raster-resampling": "linear",
      ...(warm ? {
        "raster-hue-rotate": -140,
        "raster-saturation": 0.28,
        "raster-brightness-max": 1,
      } : {}),
    },
  }, beforeId);
  if (detailed) map.setLayerZoomRange(id, 5.5, 24);
}

function keepMaritimeLabels(map: MapLibreMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol" || !layer.layout || !("text-field" in layer.layout)) continue;
    const id = layer.id.toLowerCase();
    const keep = id.startsWith("place_country") || id.includes("country") || id.includes("ocean") || id.includes("sea");
    map.setLayoutProperty(layer.id, "visibility", keep ? "visible" : "none");
  }
}

function updateDetailSources(map: MapLibreMap, props: PassageMapProps) {
  const detail = props.selectedDetail;
  if (!detail || !props.detailActive) {
    DETAIL_SLOTS.forEach((slot) => {
      const layer = `${slot}-layer`;
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", "none");
    });
    return;
  }
  const available = new Set(detail.periods);
  const coordinates = detailCoordinates(detail);
  const currentLower = available.has(props.lowerPeriod) ? props.lowerPeriod : detail.periods.at(-1) ?? props.lowerPeriod;
  const currentUpper = available.has(props.upperPeriod) ? props.upperPeriod : currentLower;
  const earlierLower = available.has(props.earlierLowerPeriod) ? props.earlierLowerPeriod : currentLower;
  const earlierUpper = available.has(props.earlierUpperPeriod) ? props.earlierUpperPeriod : earlierLower;
  updatePeriodPair({
    map,
    prefix: "detail-current",
    lowerPeriod: currentLower,
    upperPeriod: currentUpper,
    lowerUrl: detailUrl(detail, currentLower),
    upperUrl: detailUrl(detail, currentUpper),
    mix: props.mix,
    visible: true,
    detailed: true,
    coordinates,
  });
  updatePeriodPair({
    map,
    prefix: "detail-earlier",
    lowerPeriod: earlierLower,
    upperPeriod: earlierUpper,
    lowerUrl: detailUrl(detail, earlierLower),
    upperUrl: detailUrl(detail, earlierUpper),
    mix: props.mix,
    visible: props.mode === "change",
    detailed: true,
    coordinates,
  });
}

function updateMap(map: MapLibreMap, props: PassageMapProps) {
  updatePeriodPair({
    map,
    prefix: "current",
    lowerPeriod: props.lowerPeriod,
    upperPeriod: props.upperPeriod,
    lowerUrl: routeUrl(props.lowerPeriod),
    upperUrl: routeUrl(props.upperPeriod),
    mix: props.mix,
    visible: true,
  });
  updatePeriodPair({
    map,
    prefix: "earlier",
    lowerPeriod: props.earlierLowerPeriod,
    upperPeriod: props.earlierUpperPeriod,
    lowerUrl: routeUrl(props.earlierLowerPeriod),
    upperUrl: routeUrl(props.earlierUpperPeriod),
    mix: props.mix,
    visible: props.mode === "change",
  });
  (map.getSource("passage-corridors") as GeoJSONSource | undefined)?.setData(corridorData(props.corridors, props.selectedId));
  updateDetailSources(map, props);
}

export const PassageMap = forwardRef<PassageMapHandle, PassageMapProps>(function PassageMap(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [storyPoint, setStoryPoint] = useState<{ x: number; y: number; width: number } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const onCorridorSelectRef = useRef(props.onCorridorSelect);
  const onZoomChangeRef = useRef(props.onZoomChange);
  onCorridorSelectRef.current = props.onCorridorSelect;
  onZoomChangeRef.current = props.onZoomChange;

  useImperativeHandle(ref, () => ({
    focusCorridor(corridor, detail) {
      const map = mapRef.current;
      if (!map) return;
      const mobile = window.innerWidth <= 780;
      if (detail) {
        const [west, south, east, north] = detail.bounds;
        map.fitBounds([[west, south], [east, north]], {
          padding: mobile ? { top: 120, right: 28, bottom: 150, left: 28 } : { top: 105, right: 365, bottom: 125, left: 42 },
          maxZoom: 10.8,
          duration: 1150,
          essential: true,
        });
      } else {
        map.flyTo({ center: [corridor.lon, corridor.lat], zoom: 8.5, duration: 1100, essential: true });
      }
    },
    reset() {
      mapRef.current?.easeTo({ center: [0, 18], zoom: 0.75, duration: 900, essential: true });
    },
    zoomIn() {
      const map = mapRef.current;
      if (map) map.easeTo({ zoom: map.getZoom() + 0.8, duration: 320 });
    },
    zoomOut() {
      const map = mapRef.current;
      if (map) map.easeTo({ zoom: map.getZoom() - 0.8, duration: 320 });
    },
    ensureStoryVisible(lon, lat) {
      const map = mapRef.current;
      if (!map) return;
      const point = map.project([lon, lat]);
      const canvas = map.getCanvas();
      const safe = point.x > 95 && point.x < canvas.clientWidth - 365 && point.y > 92 && point.y < canvas.clientHeight - 110;
      if (!safe) {
        map.easeTo({ center: [lon, lat], zoom: Math.min(map.getZoom(), 2.7), duration: 760, essential: false });
      }
    },
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE,
      center: [0, 18],
      zoom: 0.75,
      minZoom: 0.35,
      maxZoom: 13,
      pitch: 0,
      bearing: 0,
      renderWorldCopies: true,
      canvasContextAttributes: { antialias: true },
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.on("load", () => {
      keepMaritimeLabels(map);
      const firstSymbol = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addSource("passage-countries", { type: "geojson", data: "/data/passage/countries.geojson" });
      map.addLayer({
        id: "passage-country-fill",
        type: "fill",
        source: "passage-countries",
        paint: { "fill-color": "#10191c", "fill-opacity": 0.28 },
      }, firstSymbol);
      map.addLayer({
        id: "passage-country-outline",
        type: "line",
        source: "passage-countries",
        paint: {
          "line-color": "rgba(206, 226, 222, 0.42)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 5, 0.9, 10, 1.35],
        },
      }, firstSymbol);

      GLOBAL_SLOTS.forEach((slot) => {
        map.addSource(slot, { type: "image", url: routeUrl(propsRef.current.lowerPeriod), coordinates: WORLD_COORDINATES });
      });
      addRasterLayer(map, "earlier-lower-layer", "earlier-lower", firstSymbol, true);
      addRasterLayer(map, "earlier-upper-layer", "earlier-upper", firstSymbol, true);
      addRasterLayer(map, "current-lower-layer", "current-lower", firstSymbol);
      addRasterLayer(map, "current-upper-layer", "current-upper", firstSymbol);

      map.addSource("passage-network", { type: "geojson", data: "/data/passage/world/network.geojson" });
      map.addLayer({
        id: "passage-network-glow",
        type: "line",
        source: "passage-network",
        minzoom: 2.2,
        paint: {
          "line-color": "#55cbd4",
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 2.2, 0, 4, 0.12, 7, 0.24, 12, 0.34],
          "line-width": ["interpolate", ["linear"], ["zoom"], 2.2, 0.6, 7, 2.8, 12, 5.2],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 2.2, 0.5, 8, 1.5],
        },
      }, firstSymbol);
      map.addLayer({
        id: "passage-network-core",
        type: "line",
        source: "passage-network",
        minzoom: 2.2,
        paint: {
          "line-color": ["interpolate", ["linear"], ["get", "strength"], 0, "#3f9faa", 0.6, "#76e3e3", 1, "#e4ffff"],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 2.2, 0, 4, 0.24, 8, 0.58, 12, 0.72],
          "line-width": ["interpolate", ["linear"], ["zoom"], 2.2, 0.25, 7, 0.7, 12, 1.25],
        },
      }, firstSymbol);

      DETAIL_SLOTS.forEach((slot) => {
        map.addSource(slot, { type: "image", url: routeUrl(propsRef.current.lowerPeriod), coordinates: WORLD_COORDINATES });
      });
      addRasterLayer(map, "detail-earlier-lower-layer", "detail-earlier-lower", firstSymbol, true, true);
      addRasterLayer(map, "detail-earlier-upper-layer", "detail-earlier-upper", firstSymbol, true, true);
      addRasterLayer(map, "detail-current-lower-layer", "detail-current-lower", firstSymbol, false, true);
      addRasterLayer(map, "detail-current-upper-layer", "detail-current-upper", firstSymbol, false, true);

      map.addSource("passage-coastal-cities", { type: "geojson", data: "/data/passage/coastal-cities.geojson" });
      map.addLayer({
        id: "passage-coastal-city-dots",
        type: "circle",
        source: "passage-coastal-cities",
        minzoom: 3.1,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3.1, 1.5, 8, 2.6],
          "circle-color": "#e8bd78",
          "circle-stroke-color": "rgba(5, 9, 13, 0.9)",
          "circle-stroke-width": 1,
          "circle-opacity": 0.88,
        },
      });
      map.addLayer({
        id: "passage-coastal-city-labels",
        type: "symbol",
        source: "passage-coastal-cities",
        minzoom: 3.1,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 3.1, 9.5, 8, 12],
          "text-offset": [0.65, 0],
          "text-anchor": "left",
          "text-allow-overlap": false,
          "text-optional": true,
          "symbol-sort-key": ["get", "rank"],
        },
        paint: {
          "text-color": "rgba(246, 242, 226, 0.88)",
          "text-halo-color": "rgba(4, 9, 12, 0.94)",
          "text-halo-width": 1.35,
        },
      });

      map.addSource("passage-corridors", { type: "geojson", data: corridorData(propsRef.current.corridors, propsRef.current.selectedId) });
      map.addLayer({
        id: "passage-corridor-rings",
        type: "circle",
        source: "passage-corridors",
        paint: {
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 8, 5],
          "circle-color": ["case", ["==", ["get", "selected"], 1], "#d96f47", "#071015"],
          "circle-stroke-color": "#f2b66d",
          "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2, 1],
          "circle-opacity": 0.96,
        },
      });
      map.addLayer({
        id: "passage-corridor-labels",
        type: "symbol",
        source: "passage-corridors",
        layout: {
          "text-field": ["get", "short"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 10,
          "text-offset": [1.15, 0],
          "text-anchor": "left",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#f7f4eb",
          "text-halo-color": "rgba(3, 8, 11, 0.94)",
          "text-halo-width": 1.5,
        },
      });

      map.on("mouseenter", "passage-corridor-rings", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "passage-corridor-rings", () => { map.getCanvas().style.cursor = "grab"; });
      map.on("click", "passage-corridor-rings", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onCorridorSelectRef.current(id);
      });
      map.on("zoom", () => onZoomChangeRef.current(map.getZoom()));
      loadedRef.current = true;
      setMapReady(true);
      updateMap(map, propsRef.current);
      onZoomChangeRef.current(map.getZoom());
    });

    return () => {
      loadedRef.current = false;
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) updateMap(map, propsRef.current);
  }, [props.corridors, props.detailActive, props.earlierLowerPeriod, props.earlierUpperPeriod, props.lowerPeriod, props.mix, props.mode, props.selectedDetail, props.selectedId, props.upperPeriod]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !props.activeStory) {
      setStoryPoint(null);
      return;
    }
    const updatePosition = () => {
      const point = map.project([props.activeStory!.lon, props.activeStory!.lat]);
      setStoryPoint({ x: point.x, y: point.y, width: map.getContainer().clientWidth });
    };
    updatePosition();
    map.on("move", updatePosition);
    map.on("resize", updatePosition);
    return () => {
      map.off("move", updatePosition);
      map.off("resize", updatePosition);
    };
  }, [mapReady, props.activeStory, props.storySequence]);

  return (
    <div className="passage-map" aria-label="Continuously wrapping map of commercial shipping routes">
      <div ref={containerRef} className="passage-map-canvas" />
      {props.activeStory && storyPoint && (
        <div
          key={`${props.activeStory.id}-${props.storySequence}`}
          className={`story-callout story-${
            storyPoint.width > 780 && props.activeStory.side === "right" && storyPoint.x + 374 > storyPoint.width - 340
              ? "left"
              : storyPoint.width > 780 && props.activeStory.side === "left" && storyPoint.x - 374 < 20
                ? "right"
                : props.activeStory.side
          }`}
          style={{ left: storyPoint.x, top: storyPoint.y }}
          aria-live="polite"
        >
          <span className="story-anchor" aria-hidden="true"><i /></span>
          <span className="story-leader" aria-hidden="true" />
          <article className="story-card" role="status">
            <div className="story-card-content">
              <p>{props.activeStory.category} · {formatPeriod(props.activeStory.period)}</p>
              <h2>{props.activeStory.title}</h2>
              <div className="story-copy">
                <p>{props.activeStory.body}</p>
                {props.activeStory.note && <small>{props.activeStory.note}</small>}
                <span>{props.activeStory.source}</span>
              </div>
            </div>
          </article>
        </div>
      )}
    </div>
  );
});
