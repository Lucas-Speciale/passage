"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { PassageMap } from "@/components/PassageMap";
import type { DetailConfig, PassageMapHandle } from "@/components/PassageMap";
import { chartPath, formatPeriod } from "@/lib/passage";
import { PASSAGE_STORIES, storyForPeriod } from "@/lib/stories";
import type { PassageStory } from "@/lib/stories";
import type { Corridor, CorridorData, PassageMode } from "@/types/passage";

const DEMO_PERIODS = ["2012-01", "2020-04", "2026-07"];
const DETAIL_ZOOM = 5.5;
const MONTH_DURATION = 560;
const STORY_CLOSE_DURATION = 720;
const LAST_STORY_ID = PASSAGE_STORIES[PASSAGE_STORIES.length - 1].id;
const GUIDE_DISMISSED_KEY = "passage:guide-dismissed:2026-08-v1";

interface PassageManifest {
  periods: string[];
}

interface DetailManifest {
  resolution: number;
  corridors: Record<string, DetailConfig>;
}

type AnalysisView = "fingerprint" | "transits";

const FINGERPRINT_EDGES: Record<string, [string, string]> = {
  suez: ["West edge", "East edge"],
  panama: ["Southwest edge", "Northeast edge"],
  "bab-el-mandeb": ["West edge", "East edge"],
  malacca: ["Southwest edge", "Northeast edge"],
  hormuz: ["North edge", "South edge"],
  cape: ["North edge", "South edge"],
};

function routeUrl(period: string) {
  return `/data/passage/world/route-${period}.webp`;
}

function detailUrl(config: DetailConfig, period: string) {
  return `/data/passage/details/${config.slug}/route-${period}.webp`;
}

function hasDismissedGuide() {
  try {
    return window.localStorage.getItem(GUIDE_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberGuideDismissal() {
  try {
    window.localStorage.setItem(GUIDE_DISMISSED_KEY, "true");
  } catch {
    // The guide still closes when browser storage is unavailable.
  }
}

function CorridorAnalysis({
  corridor,
  currentPeriod,
  detail,
  periods,
  time,
  minimumTime,
  onFocus,
  onTimeChange,
  onPause,
}: {
  corridor: Corridor;
  currentPeriod: string;
  detail?: DetailConfig;
  periods: string[];
  time: number;
  minimumTime: number;
  onFocus: () => void;
  onTimeChange: (nextTime: number) => void;
  onPause: () => void;
}) {
  const [analysisView, setAnalysisView] = useState<AnalysisView>("fingerprint");
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
  const fingerprintEdges = detail ? FINGERPRINT_EDGES[detail.slug] : undefined;
  const fingerprintPosition = periods.length > 1 ? (time / (periods.length - 1)) * 100 : 0;

  return (
    <section className="corridor-analysis" aria-label={`${corridor.name} route analysis`}>
      <div className="analysis-heading">
        <div>
          <span>Selected passage</span>
          <h2>{corridor.name}</h2>
        </div>
        <button className="focus-button" onClick={onFocus}><i aria-hidden="true" />Focus route</button>
      </div>
      <p className="corridor-note">{corridor.note}</p>
      <div className="analysis-switch" aria-label="Passage analysis view">
        <button aria-pressed={analysisView === "fingerprint"} className={analysisView === "fingerprint" ? "active" : ""} onClick={() => setAnalysisView("fingerprint")}>Fingerprint</button>
        <button aria-pressed={analysisView === "transits"} className={analysisView === "transits" ? "active" : ""} onClick={() => setAnalysisView("transits")}>Transits</button>
      </div>
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
      {analysisView === "fingerprint" && detail && fingerprintEdges ? (
        <div className="fingerprint-wrap">
          <div className="fingerprint-heading">
            <span>Route shape through time</span>
            <strong>{formatPeriod(currentPeriod)}</strong>
          </div>
          <div className="fingerprint-plot">
            <Image
              key={detail.slug}
              src={`/data/passage/fingerprints/${detail.slug}.webp`}
              alt={`${corridor.name} transverse route-presence fingerprint from 2012 to 2026`}
              width={700}
              height={224}
              unoptimized
              draggable={false}
            />
            <div className="fingerprint-edges" aria-hidden="true"><span>{fingerprintEdges[0]}</span><span>{fingerprintEdges[1]}</span></div>
            <i className="fingerprint-playhead" style={{ left: `${fingerprintPosition}%` }} aria-hidden="true" />
            <input
              aria-label={`Explore ${corridor.name} fingerprint by month`}
              type="range"
              min={minimumTime}
              max={Math.max(periods.length - 1, 0)}
              step="0.01"
              value={time}
              onPointerDown={onPause}
              onChange={(event) => onTimeChange(Number(event.target.value))}
            />
          </div>
          <div className="fingerprint-years"><span>2012</span><span>Drag to read the route</span><span>2026</span></div>
          <p className="fingerprint-note">Each vertical slice compresses one month across the passage. Bright bands mark the persistent lane; branching and drift appear around it.</p>
        </div>
      ) : (
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
      )}
      <p className="source-line">{analysisView === "fingerprint" ? "Global Fishing Watch · relative monthly route presence" : "IMF PortWatch · daily chokepoint estimates"}</p>
    </section>
  );
}

export function PassageExplorer() {
  const [showcase, setShowcase] = useState(false);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [periods, setPeriods] = useState<string[]>(DEMO_PERIODS);
  const [detailManifest, setDetailManifest] = useState<DetailManifest | null>(null);
  const [selectedId, setSelectedId] = useState("chokepoint1");
  const [time, setTime] = useState(DEMO_PERIODS.length - 1);
  const [mode, setMode] = useState<PassageMode>("flow");
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(0.75);
  const [routesOnly, setRoutesOnly] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(!showcase);
  const [contextAttention, setContextAttention] = useState(false);
  const [activeStory, setActiveStory] = useState<PassageStory | null>(null);
  const [storyClosing, setStoryClosing] = useState(false);
  const [storySequence, setStorySequence] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutAttention, setAboutAttention] = useState(false);
  const mapRef = useRef<PassageMapHandle>(null);
  const previousFrame = useRef<number | null>(null);
  const previousStoryPeriod = useRef<string | null>(null);
  const contextTourCompleted = useRef(false);
  const disableContextAfterStory = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const showcaseEnabled = new URLSearchParams(window.location.search).get("showcase") === "1";
      setShowcase(showcaseEnabled);
      if (showcaseEnabled) setContextEnabled(false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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

  const closeAbout = useCallback(() => {
    rememberGuideDismissal();
    setAboutOpen(false);
    setAboutAttention(true);
    setPlaying(true);
  }, []);

  const showStory = useCallback((story: PassageStory) => {
    setStoryClosing(false);
    setActiveStory(story);
    setStorySequence((sequence) => sequence + 1);
    mapRef.current?.ensureStoryVisible(story.lon, story.lat);
  }, []);

  const continueStory = useCallback(() => {
    if (activeStory?.id === LAST_STORY_ID && !contextTourCompleted.current) {
      disableContextAfterStory.current = true;
    }
    setStoryClosing(true);
  }, [activeStory]);

  useEffect(() => {
    if (showcase) return;
    const openTimer = window.setTimeout(() => {
      if (!hasDismissedGuide()) setAboutOpen(true);
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [showcase]);

  useEffect(() => {
    if (!aboutOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAbout();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [aboutOpen, closeAbout]);

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
        setTime(showcase ? Math.min(96, manifest.periods.length - 1) : manifest.periods.length - 1);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
      });
    return () => controller.abort();
  }, [showcase]);

  useEffect(() => {
    if (!playing || activeStory) {
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
  }, [activeStory, maxIndex, mode, playing]);

  useEffect(() => {
    if (!showcase || periods.length <= 97) return;
    let animationFrame = 0;
    const started = performance.now();
    const animateShowcase = (now: number) => {
      const phase = ((now - started) % 24_000) / 24_000;
      const easedCycle = (1 - Math.cos(phase * Math.PI * 2)) / 2;
      setTime(96 + easedCycle * Math.min(40, periods.length - 97));
      animationFrame = requestAnimationFrame(animateShowcase);
    };
    animationFrame = requestAnimationFrame(animateShowcase);
    return () => cancelAnimationFrame(animationFrame);
  }, [periods.length, showcase]);

  useEffect(() => {
    if (!storyClosing) return;
    const timer = window.setTimeout(() => {
      setActiveStory(null);
      setStoryClosing(false);
      if (disableContextAfterStory.current) {
        disableContextAfterStory.current = false;
        contextTourCompleted.current = true;
        previousStoryPeriod.current = null;
        setContextEnabled(false);
        setContextAttention(true);
      }
    }, STORY_CLOSE_DURATION);
    return () => window.clearTimeout(timer);
  }, [storyClosing]);

  useEffect(() => {
    if (!contextEnabled) return;
    if (previousStoryPeriod.current === lowerPeriod) return;
    previousStoryPeriod.current = lowerPeriod;
    const story = storyForPeriod(lowerPeriod);
    if (!story) return;
    const timer = window.setTimeout(() => {
      const storyIndex = periods.indexOf(story.period);
      if (storyIndex >= 0) setTime(storyIndex);
      showStory(story);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contextEnabled, lowerPeriod, periods, showStory]);

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
    <main className={`passage-app mode-${mode}${showcase ? " showcase-mode" : ""}`}>
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
          activeStory={contextEnabled ? activeStory : null}
          storySequence={storySequence}
          storyClosing={storyClosing}
          routesOnly={routesOnly}
          onStoryContinue={continueStory}
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
        <button
          className={`context-button${contextEnabled ? " active" : ""}${contextAttention ? " attention" : ""}`}
          aria-pressed={contextEnabled}
          aria-label={`${contextEnabled ? "Hide" : "Show"} timeline context`}
          onClick={() => {
            previousStoryPeriod.current = null;
            disableContextAfterStory.current = false;
            setActiveStory(null);
            setStoryClosing(false);
            setContextAttention(false);
            setContextEnabled((enabled) => !enabled);
          }}
          onAnimationEnd={(event) => {
            if (event.animationName === "about-attention") setContextAttention(false);
          }}
        ><i aria-hidden="true" /><span>Context</span></button>
        <button
          className={`about-button ${aboutAttention ? "attention" : ""}`}
          onClick={() => {
            setAboutAttention(false);
            setAboutOpen(true);
          }}
          onAnimationEnd={(event) => {
            if (event.animationName === "about-attention") setAboutAttention(false);
          }}
          aria-controls="passage-guide"
          aria-expanded={aboutOpen}
          aria-label="Open guide to Passage"
        ><span>i</span> About</button>
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
        {selected ? (
          <CorridorAnalysis
            corridor={selected}
            currentPeriod={lowerPeriod}
            detail={selectedDetail}
            periods={periods}
            time={time}
            minimumTime={mode === "change" ? 12 : 0}
            onFocus={() => focusCorridor(selected)}
            onTimeChange={setTime}
            onPause={() => setPlaying(false)}
          />
        ) : <div className="panel-loading">Loading passage index…</div>}
      </aside>

      <div className="map-controls">
        <div className="map-tools" aria-label="Map navigation">
          <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">+</button>
          <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">−</button>
          <button className="reset-button" onClick={() => mapRef.current?.reset()}>Whole world</button>
        </div>
        <button
          className={`routes-only-button${routesOnly ? " active" : ""}`}
          aria-pressed={routesOnly}
          onClick={() => setRoutesOnly((enabled) => !enabled)}
        ><i aria-hidden="true" /><span>Routes only</span></button>
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
          {contextEnabled && (
            <div className="story-ticks" aria-label="Timeline context markers">
              {PASSAGE_STORIES.map((story) => {
                const storyIndex = periods.indexOf(story.period);
                const minimum = mode === "change" ? 12 : 0;
                if (storyIndex < minimum || storyIndex < 0) return null;
                const storyPosition = ((storyIndex - minimum) / Math.max(maxIndex - minimum, 1)) * 100;
                return (
                  <button
                    key={story.id}
                    className={activeStory?.id === story.id ? "active" : ""}
                    style={{ left: `${storyPosition}%` }}
                    onClick={() => {
                      previousStoryPeriod.current = story.period;
                      setPlaying(false);
                      setTime(storyIndex);
                      showStory(story);
                    }}
                    aria-label={`View context: ${story.title}, ${formatPeriod(story.period)}`}
                    title={`${story.title} · ${formatPeriod(story.period)}`}
                  />
                );
              })}
            </div>
          )}
          <input
            aria-label="Select route period"
            type="range"
            min={mode === "change" ? 12 : 0}
            max={maxIndex}
            step="0.01"
            value={time}
            onPointerDown={() => {
              setPlaying(false);
              setActiveStory(null);
              setStoryClosing(false);
            }}
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
          if (event.target === event.currentTarget) closeAbout();
        }}>
          <section id="passage-guide" className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
            <button className="dialog-close" onClick={closeAbout} aria-label="Close guide to Passage" autoFocus>×</button>
            <p className="eyebrow">How to read Passage</p>
            <h2 id="about-title">The network is the subject.</h2>
            <p>Play or drag the timeline to watch the ocean network change month by month. Passage shows aggregated cargo-vessel AIS presence—not individual ships, cargo tonnage, or exact voyages.</p>
            <div>
              <span>Context</span><p>Context starts enabled, connecting route patterns with infrastructure, seasonal navigation, conflict, and disruption. You can turn it off at any time using Context in the upper-right. Press Continue to move through each note.</p>
              <span>Flow</span><p>Cyan brightness shows how consistently cargo-vessel AIS occupied each route during the selected month. Bright cores are persistent corridors; faint branches were used less often.</p>
              <span>Change</span><p>Compare the selected month with the same month one year earlier. Amber was stronger before, cyan is stronger now, and pale routes persisted across both periods.</p>
              <span>Passages</span><p>Select one of six strategic passages to zoom into its higher-detail monthly route field while the shared timeline keeps moving.</p>
              <span>Fingerprint</span><p>Read the selected passage as a 2012–2026 route profile. Each vertical slice is one month; drag across it to reveal persistent lanes, branching, and drift on the map.</p>
              <span>Transits</span><p>Switch to the PortWatch chart for estimated daily cargo-vessel transits and year-over-year change. This separate series begins in 2019.</p>
            </div>
            <small className="guide-sources">
              <span><strong>Route presence and fingerprints</strong> Global Fishing Watch public-global-presence v4.0</span>
              <span><strong>Passage transit estimates</strong> IMF PortWatch</span>
              <span><strong>Basemap and place data</strong> OpenFreeMap · OpenMapTiles · OpenStreetMap</span>
              <span><strong>Reference validation</strong> World Bank–IMF commercial shipping-density archive, 2015–2021 (not displayed)</span>
              <span><strong>Context research</strong> IMO · UNCTAD · United Nations · Arctic Council · Suez Canal Authority · Panama Canal Authority · Malaysia Marine Department STRAITREP</span>
            </small>
          </section>
        </div>
      )}
    </main>
  );
}
