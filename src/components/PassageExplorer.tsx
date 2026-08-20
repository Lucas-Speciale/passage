"use client";

import { useEffect, useRef, useState } from "react";

import { PassageMap } from "@/components/PassageMap";
import type { DetailConfig, PassageMapHandle } from "@/components/PassageMap";
import { chartPath, formatPeriod } from "@/lib/passage";
import type { Corridor, CorridorData, PassageMode } from "@/types/passage";

const DEMO_PERIODS = ["2012-01", "2020-04", "2026-07"];
const DETAIL_ZOOM = 5.5;
const MONTH_DURATION = 560;

interface PassageManifest {
  periods: string[];
}

interface DetailManifest {
  resolution: number;
  corridors: Record<string, DetailConfig>;
}

function routeUrl(period: string) {
  return `/data/passage/world/route-${period}.webp`;
}

function detailUrl(config: DetailConfig, period: string) {
  return `/data/passage/details/${config.slug}/route-${period}.webp`;
}

function CorridorChart({ corridor, currentPeriod, onFocus }: { corridor: Corridor; currentPeriod: string; onFocus: () => void }) {
  const width = 268;
  const height = 82;
  const path = chartPath(corridor.series, width, height);
  const values = corridor.series.map((point) => point.dailyAverage);
  // Keep the marker on the exact same scale used by chartPath.
  const high = values.length ? Math.max(...values) : 1;
  const low = values.length ? Math.min(...values) : 0;
  const span = Math.max(high - low, 1);
  const currentIndex = corridor.series.findIndex((point) => point.period === currentPeriod);
  const currentPoint = currentIndex >= 0 ? corridor.series[currentIndex] : undefined;
  const previousYear = currentPoint
    ? corridor.series.find((point) => point.period === `${Number(currentPeriod.slice(0, 4)) - 1}${currentPeriod.slice(4)}`)
    : undefined;
  const delta = currentPoint && previousYear && previousYear.dailyAverage
    ? ((currentPoint.dailyAverage - previousYear.dailyAverage) / previousYear.dailyAverage) * 100
    : undefined;
  const markerX = currentIndex >= 0 ? (currentIndex / Math.max(corridor.series.length - 1, 1)) * width : 0;
  const markerY = currentPoint ? height - ((currentPoint.dailyAverage - low) / span) * height : 0;

  return (
    <section className="corridor-analysis" aria-label={`${corridor.name} transit history`}>
      <div className="analysis-heading">
        <div>
          <span>Selected passage</span>
          <h2>{corridor.name}</h2>
        </div>
        <button className="focus-button" onClick={onFocus}><i aria-hidden="true" />Focus route</button>
      </div>
      <p className="corridor-note">{corridor.note}</p>
      <div className="metric-grid">
        <div>
          <span>{currentPoint ? formatPeriod(currentPeriod) : "PortWatch starts 2019"}</span>
          <strong>{currentPoint ? currentPoint.dailyAverage.toFixed(1) : "—"}</strong>
          <small>{currentPoint ? "daily cargo transits" : "No series for this month"}</small>
        </div>
        <div>
          <span>vs. same month prior year</span>
          <strong className={delta === undefined ? "" : delta < 0 ? "warm" : "cool"}>
            {delta === undefined ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
          </strong>
          <small>{previousYear ? formatPeriod(previousYear.period) : "Awaiting comparable month"}</small>
        </div>
      </div>
      <div className="chart-wrap">
        <div className="chart-labels"><span>{Math.ceil(high)}</span><span>{Math.floor(low)}</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Monthly average cargo-vessel transits at ${corridor.name} from 2019 to 2026`}>
          <path className="chart-area" d={`${path} L${width},${height} L0,${height} Z`} />
          <path className="chart-line" d={path} />
          <line x1="0" x2={width} y1="41" y2="41" className="chart-grid" />
          {currentPoint && (
            <>
              <line x1={markerX} x2={markerX} y1="0" y2={height} className="chart-playhead" />
              <circle cx={markerX} cy={markerY} r="3.2" className="chart-marker" />
            </>
          )}
        </svg>
        <div className="chart-years"><span>2019</span><span>PortWatch coverage only</span><span>2026</span></div>
      </div>
      <p className="source-line">IMF PortWatch · daily chokepoint estimates</p>
    </section>
  );
}

export function PassageExplorer() {
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [periods, setPeriods] = useState<string[]>(DEMO_PERIODS);
  const [detailManifest, setDetailManifest] = useState<DetailManifest | null>(null);
  const [selectedId, setSelectedId] = useState("chokepoint1");
  const [time, setTime] = useState(DEMO_PERIODS.length - 1);
  const [mode, setMode] = useState<PassageMode>("flow");
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(0.75);
  const [aboutOpen, setAboutOpen] = useState(false);
  const mapRef = useRef<PassageMapHandle>(null);
  const previousFrame = useRef<number | null>(null);

  const maxIndex = periods.length - 1;
  const lowerIndex = Math.min(maxIndex, Math.max(0, Math.floor(time)));
  const upperIndex = Math.min(maxIndex, lowerIndex + 1);
  const mix = Math.max(0, Math.min(1, time - lowerIndex));
  const lowerPeriod = periods[lowerIndex];
  const upperPeriod = periods[upperIndex];
  const earlierLowerIndex = Math.max(0, lowerIndex - 12);
  const earlierUpperIndex = Math.max(0, upperIndex - 12);
  const earlierLowerPeriod = periods[earlierLowerIndex];
  const earlierUpperPeriod = periods[earlierUpperIndex];
  const selected = corridors.find((corridor) => corridor.id === selectedId) ?? corridors[0];
  const selectedDetail = selected ? detailManifest?.corridors[selected.id] : undefined;
  const detailActive = Boolean(selectedDetail && zoom >= DETAIL_ZOOM);
  const dateLabel = mode === "change"
    ? `${formatPeriod(earlierLowerPeriod)} — ${formatPeriod(lowerPeriod)}`
    : formatPeriod(lowerPeriod);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/data/passage/corridors.json", { signal: controller.signal }),
      fetch("/data/passage/manifest.json", { signal: controller.signal }),
      fetch("/data/passage/details/manifest.json", { signal: controller.signal }),
    ])
      .then(async ([corridorResponse, manifestResponse, detailResponse]) => {
        if (!corridorResponse.ok || !manifestResponse.ok || !detailResponse.ok) throw new Error("Passage data could not load.");
        const data = await corridorResponse.json() as CorridorData;
        const manifest = await manifestResponse.json() as PassageManifest;
        const details = await detailResponse.json() as DetailManifest;
        setCorridors(data.corridors);
        setPeriods(manifest.periods);
        setDetailManifest(details);
        setTime(manifest.periods.length - 1);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!playing) {
      previousFrame.current = null;
      return;
    }
    let animationFrame = 0;
    const tick = (timestamp: number) => {
      const previous = previousFrame.current ?? timestamp;
      previousFrame.current = timestamp;
      const elapsed = Math.min(timestamp - previous, 80);
      setTime((current) => {
        const minimum = mode === "change" ? 12 : 0;
        const next = current + elapsed / MONTH_DURATION;
        return next > maxIndex ? minimum : next;
      });
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [maxIndex, mode, playing]);

  useEffect(() => {
    [0, 12, lowerIndex - 1, upperIndex, upperIndex + 1, earlierLowerIndex, earlierUpperIndex, earlierUpperIndex + 1].forEach((index) => {
      const adjacent = periods[index];
      if (!adjacent) return;
      const preload = new window.Image();
      preload.src = routeUrl(adjacent);
    });
  }, [earlierLowerIndex, earlierUpperIndex, lowerIndex, periods, upperIndex]);

  useEffect(() => {
    if (!detailActive || !selectedDetail) return;
    const available = new Set(selectedDetail.periods);
    [lowerIndex, upperIndex, upperIndex + 1, earlierLowerIndex, earlierUpperIndex, earlierUpperIndex + 1].forEach((index) => {
      const adjacent = periods[index];
      if (!adjacent || !available.has(adjacent)) return;
      const preload = new window.Image();
      preload.src = detailUrl(selectedDetail, adjacent);
    });
  }, [detailActive, earlierLowerIndex, earlierUpperIndex, lowerIndex, periods, selectedDetail, upperIndex]);

  const focusCorridor = (corridor: Corridor) => {
    mapRef.current?.focusCorridor(corridor, detailManifest?.corridors[corridor.id]);
  };

  const selectCorridor = (corridor: Corridor) => {
    setSelectedId(corridor.id);
    focusCorridor(corridor);
  };

  const selectCorridorById = (id: string) => {
    const corridor = corridors.find((candidate) => candidate.id === id);
    if (corridor) selectCorridor(corridor);
  };

  const switchMode = (nextMode: PassageMode) => {
    setMode(nextMode);
    if (nextMode === "change" && time < 12) setTime(12);
  };

  return (
    <main className={`passage-app mode-${mode}`}>
      <section className="ocean-stage">
        <PassageMap
          ref={mapRef}
          corridors={corridors}
          selectedId={selectedId}
          selectedDetail={selectedDetail}
          detailActive={detailActive}
          mode={mode}
          lowerPeriod={lowerPeriod}
          upperPeriod={upperPeriod}
          earlierLowerPeriod={earlierLowerPeriod}
          earlierUpperPeriod={earlierUpperPeriod}
          mix={mix}
          onCorridorSelect={selectCorridorById}
          onZoomChange={setZoom}
        />
        <div className="ocean-grid" aria-hidden="true" />
      </section>

      <header className="brand-lockup">
        <p className="eyebrow">The ocean movement study</p>
        <h1>Passage</h1>
        <p>Global shipping routes through time</p>
      </header>

      <div className="period-overlay" aria-live="polite">
        <span>{mode === "change" ? "Rolling annual change" : "Cargo presence"}</span>
        <strong>{dateLabel}</strong>
        {detailActive && <small>0.01° passage detail</small>}
      </div>

      <div className="top-controls">
        <div className="mode-switch" aria-label="Map mode">
          <button className={mode === "flow" ? "active" : ""} onClick={() => switchMode("flow")}>Flow</button>
          <button className={mode === "change" ? "active" : ""} onClick={() => switchMode("change")}>Change</button>
        </div>
        <button className="about-button" onClick={() => setAboutOpen(true)} aria-label="About this map"><span>i</span> About</button>
      </div>

      <aside className="explore-panel">
        <div className="panel-kicker"><span>Passage index</span><small>6 selected</small></div>
        <div className="corridor-list">
          {corridors.map((corridor, index) => (
            <button key={corridor.id} className={selectedId === corridor.id ? "active" : ""} onClick={() => selectCorridor(corridor)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{corridor.short}</strong>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>
        {selected ? <CorridorChart corridor={selected} currentPeriod={lowerPeriod} onFocus={() => focusCorridor(selected)} /> : <div className="panel-loading">Loading passage index…</div>}
      </aside>

      <div className="map-tools" aria-label="Map controls">
        <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">+</button>
        <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">−</button>
        <button className="reset-button" onClick={() => mapRef.current?.reset()}>Whole world</button>
      </div>

      <div className={`map-legend ${mode}`}>
        {mode === "flow" ? (
          <><span>Relative presence</span><i /><div><small>Less frequent</small><small>More frequent</small></div></>
        ) : (
          <><span>Same month, one year apart</span><i /><div><small>Prior year</small><small>Stable</small><small>Selected year</small></div></>
        )}
      </div>

      <footer className="timeline-shell">
        <button
          className="play-button"
          onPointerDown={(event) => {
            event.stopPropagation();
            setPlaying(!playing);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setPlaying(!playing);
            }
          }}
          onClick={(event) => {
            if (event.detail === 0) setPlaying(!playing);
          }}
          aria-label={playing ? "Pause timeline" : `Play ${mode} timeline`}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>{playing ? "Pause" : "Play"}
        </button>
        <output>{lowerPeriod.slice(0, 4)}</output>
        <div className="time-control">
          <input
            aria-label="Select route period"
            type="range"
            min={mode === "change" ? 12 : 0}
            max={maxIndex}
            step="0.01"
            value={time}
            onPointerDown={() => setPlaying(false)}
            onChange={(event) => setTime(Number(event.target.value))}
          />
          <div className="timeline-years"><span>{mode === "change" ? "2013" : "2012"}</span><span>2016</span><span>2020</span><span>2023</span><span>2026</span></div>
        </div>
        <div className="timeline-note">
          <strong>{selected ? `${selected.short} · ${lowerPeriod}` : "Representative AIS presence"}</strong>
          <span>{selected && lowerPeriod >= "2019-01" ? "Passage chart and route field share this month." : "PortWatch passage estimates begin in 2019."}</span>
        </div>
      </footer>

      {aboutOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAboutOpen(false);
        }}>
          <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
            <button className="dialog-close" onClick={() => setAboutOpen(false)} aria-label="Close about Passage">×</button>
            <p className="eyebrow">How to read Passage</p>
            <h2 id="about-title">The network is the subject.</h2>
            <p>The luminous field shows standardized hourly AIS presence for cargo vessels moving 6–25 knots. Brighter routes were more consistently occupied within the selected month.</p>
            <div>
              <span>Flow</span><p>Monthly fields blend continuously as the timeline moves. A vector route spine preserves sharp geometry at close zoom without claiming vessel-level precision.</p>
              <span>Change</span><p>Each selected month is compared with the same month one year earlier. Amber was stronger before, cyan is stronger now, and pale routes persisted.</p>
              <span>Passages</span><p>Selecting a passage opens exact 0.01° monthly detail. Country boundaries stay sharp globally; labels are limited to countries and shipping-relevant coastal cities.</p>
            </div>
            <small>Draft 3 · Global Fishing Watch public presence v4.0 · IMF PortWatch · OpenFreeMap</small>
          </section>
        </div>
      )}
    </main>
  );
}
