"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, ColorType, CandlestickSeries, AreaSeries, HistogramSeries,
  createSeriesMarkers, LineStyle,
  type IChartApi, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp,
} from "lightweight-charts";

import {
  TIMEFRAMES, TF_SECONDS, fromDaily, isIntraday, normalize,
  type Candle, type Timeframe,
} from "@/lib/candles";
import { DeltaChip } from "@/components/viz";
import { Delta, Logo } from "@/components/ui";
import { fmtNum, fmtUsd } from "@/lib/format";

export type { Candle };
export interface ChartEvent {
  time: number; label: string; title: string; type?: string; detail?: string | null;
}

/** Event families the user can toggle on the chart. */
export const EVENT_GROUPS: { key: string; label: string; types: string[]; color: string }[] = [
  { key: "raise", label: "Raise", types: ["raise_closed", "raise_opened"], color: "#0ca30c" },
  { key: "launch", label: "Launch", types: ["token_launch"], color: "#3987e5" },
  { key: "governance", label: "Governance", types: ["proposal", "governance"], color: "#9085e9" },
  { key: "treasury", label: "Treasury", types: ["treasury"], color: "#199e70" },
  { key: "partnership", label: "Partnership", types: ["partnership"], color: "#d55181" },
  { key: "product", label: "Product", types: ["github_release", "product"], color: "#d95926" },
  { key: "unlock", label: "Unlock", types: ["unlock"], color: "#fab219" },
  { key: "listing", label: "Listing", types: ["listing"], color: "#c98500" },
  { key: "buyback", label: "Buyback", types: ["buyback"], color: "#008300" },
  { key: "whale", label: "Whale Flow", types: ["whale_buy", "whale_sell"], color: "#e66767" },
];

const GROUP_OF = new Map<string, (typeof EVENT_GROUPS)[number]>();
for (const g of EVENT_GROUPS) for (const t of g.types) GROUP_OF.set(t, g);

type Mode = "candles" | "area";

/**
 * There is no range picker: the timeframe alone decides what is on screen, and
 * the window is whatever fits. These two numbers define "fits" — a target bar
 * pitch in CSS pixels, and a floor so a narrow phone still gets a readable
 * chart rather than three fat candles.
 */
/**
 * Intervals the toolbar offers. A presentation subset of `TIMEFRAMES` — the
 * shared constant still carries 1m, so the candle API, `TF_SECONDS` and the
 * fold-from-daily logic are all untouched; it is simply not offered as a button.
 */
const OFFERED_TIMEFRAMES: readonly Timeframe[] = TIMEFRAMES.filter((tf) => tf !== "1m");

const BAR_PX = 8;
const MIN_BARS = 24;
/** A little air on the right, the way desk charts leave room ahead of price. */
const RIGHT_PAD_BARS = 2;

/** Theme tokens, matching globals.css (the original grey/blue terminal). */
const T = {
  up: "#0ca30c",
  down: "#d03b3b",
  accent: "#3987e5",
  grid: "#2c2c2a",
  /**
   * Horizontal rules only, and fainter than the pane borders. A full grid at
   * `grid` strength competes with the candles for attention; at this weight it
   * reads as a ruler behind them, which is what a price grid is for.
   */
  gridSoft: "rgba(255, 255, 255, 0.05)",
  axis: "#383835",
  muted: "#898781",
  ink: "#ffffff",
  surface: "#1a1a19",
};

/**
 * Plot height in px. Width is fluid — the resize observer feeds it in — but
 * height is fixed, so this is the one number that sets how tall the card reads.
 * The panes below divide it by ratio rather than by pixels, so the candles and
 * the volume histogram shrink together with whatever is set here.
 */
const CHART_HEIGHT = 360;

/**
 * Price:volume height ratio. Volume is context for the bars above it, never the
 * subject, so it gets a seventh of the chart the way a desk terminal shows it.
 */
const PRICE_STRETCH = 6;
const VOLUME_STRETCH = 1;

/**
 * Hold the price/volume split.
 *
 * Stretch factors rather than setHeight: an absolute pixel height is a one-off
 * instruction the library re-apportions whenever a pane is rebuilt or the chart
 * resizes, which let volume creep up to over half the chart. A ratio is
 * declarative and survives both.
 */
function sizeVolumePane(chart: IChartApi) {
  const panes = chart.panes();
  if (panes.length < 2) return;
  panes[0].setStretchFactor(PRICE_STRETCH);
  panes[1].setStretchFactor(VOLUME_STRETCH);
}

/**
 * Plot height for the expanded view: the viewport, less what the card's own
 * chrome (header, toolbar, legend, period strip) takes above and below it.
 * Read at click time, so it never runs during a server render.
 */
function expandedPlotHeight(): number {
  const CHROME_PX = 330;
  const MIN_PLOT_PX = 260;
  return Math.max(MIN_PLOT_PX, window.innerHeight - CHROME_PX);
}

/** "Aug 6, 2026 14:30" in UTC, for the header's freshness stamp. */
function fmtUtcStamp(ts: number): string {
  const d = new Date(ts * 1000);
  const date = d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  });
  return `${date} ${time}`;
}

/** Compact span for the header, e.g. 5400s → "1h", 950400s → "11d". */
function spanLabel(seconds: number): string {
  const units: [number, string][] = [
    [31536000, "y"], [2592000, "mo"], [86400, "d"], [3600, "h"], [60, "m"],
  ];
  for (const [size, suffix] of units) {
    if (seconds >= size) return `${Math.round(seconds / size)}${suffix}`;
  }
  return `${Math.max(1, Math.round(seconds))}s`;
}

/** Candlestick glyph: two bodies with wicks, drawn at 14px. */
function CandlesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden focusable="false">
      <path d="M4 1.5v11M10 1.5v11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="2.2" y="4" width="3.6" height="6" rx="0.6" fill="currentColor" />
      <rect x="8.2" y="2.8" width="3.6" height="5" rx="0.6" fill="currentColor" />
    </svg>
  );
}

/** Line glyph: a simple price path. */
function LineIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden focusable="false">
      <path
        d="M1.5 9.5 4.5 6 7 8 12.5 3"
        stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/** Calendar glyph, for the date-range control. */
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden focusable="false">
      <rect x="1.8" y="2.8" width="10.4" height="9.4" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.8 5.6h10.4M4.6 1.8v2M9.4 1.8v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Download glyph: a tray with an arrow into it. */
function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden focusable="false">
      <path
        d="M7 1.9v6.6m0 0L4.5 6M7 8.5 9.5 6M2.2 10.1v1a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1v-1"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/** Four corners pushing out / pulling in, for the fullscreen toggle. */
function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden focusable="false">
      <path
        d={on
          ? "M5.6 1.9v3.7H1.9M8.4 1.9v3.7h3.7M5.6 12.1V8.4H1.9M8.4 12.1V8.4h3.7"
          : "M1.9 5.2V1.9h3.3M12.1 5.2V1.9H8.8M1.9 8.8v3.3h3.3M12.1 8.8v3.3H8.8"}
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Toolbar control groups.
 *
 * Every cluster — metric, series type, interval, utilities — sits in the same
 * inset tray so the toolbar reads as one row of related switches rather than
 * loose buttons, and the active item is the only lit surface in its tray.
 */
function SegGroup({
  children, label, className = "",
}: {
  children: React.ReactNode; label?: string; className?: string;
}) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      className={`flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-surface2/50 p-0.5 ${className}`}
    >
      {children}
    </div>
  );
}

/** Square icon button for the series-type switch. */
function IconButton({
  active, onClick, label, children,
}: {
  active: boolean; onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-white/10 text-ink shadow-sm shadow-black/20"
          : "text-muted hover:bg-white/5 hover:text-ink2"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Utility button that carries an icon but no state of its own.
 *
 * `disabled` is a first-class case here: the date-range and export controls are
 * drawn because the toolbar is specified to carry them, but neither has a
 * behaviour behind it yet, and a button that silently does nothing is worse
 * than one that says so.
 */
function UtilityButton({
  label, onClick, disabled = false, children,
}: {
  label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? `${label} — not available yet` : label}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        disabled
          ? "cursor-not-allowed text-faint opacity-50"
          : "text-muted hover:bg-white/5 hover:text-ink2"
      }`}
    >
      {children}
    </button>
  );
}

/** Flat toolbar button shared by the interval and series-type groups. */
function SegButton({
  active, onClick, children, className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-md px-2 py-1.5 text-[11px] leading-none transition-colors sm:px-2.5 ${
        active
          ? "bg-white/10 font-medium text-ink shadow-sm shadow-black/20"
          : "text-muted hover:bg-white/5 hover:text-ink2"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** One figure in the header's market row. */
function MarketStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-nowrap text-[11px] text-muted">{label}</div>
      <div className="num mt-1 truncate text-[13px] font-medium text-ink">{value}</div>
    </div>
  );
}

/**
 * One cell of the footer period strip.
 *
 * A period with no figure behind it renders an em dash rather than a zero —
 * the platform's rule that a missing number stays missing applies here too.
 */
function PeriodStat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 py-3">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="text-[13px] font-medium">
        <Delta v={value} notation="sign" />
      </span>
    </div>
  );
}

/** What the y-axis measures. Market cap is price scaled by circulating supply. */
type Metric = "price" | "mcap";

export function PriceChart({
  candles, events = [], height = CHART_HEIGHT, slug, circulatingSupply = null,
  name, symbol, imageUrl = null,
  marketCap = null, volume24h = null, change24h = null, lastUpdated = null,
  periods = null,
}: {
  candles: Candle[];
  events?: ChartEvent[];
  height?: number;
  slug?: string;
  /** Enables the Market Cap switch. Without it the toggle is not offered. */
  circulatingSupply?: number | null;
  // ---------------------------------------------------------------------
  // Everything below is read-only chrome for the card header and footer. None
  // of it reaches the chart: the series, the scales and every interaction are
  // driven by `candles` / `circulatingSupply` exactly as before.
  // ---------------------------------------------------------------------
  /** Project name, for the logo fallback and the "<name> Price" subtitle. */
  name: string;
  /** Ticker shown in the pair label and against the supply figure. */
  symbol: string;
  imageUrl?: string | null;
  marketCap?: number | null;
  volume24h?: number | null;
  /** 24h change for the footer strip. */
  change24h?: number | null;
  /** Unix seconds of the newest snapshot behind these figures. */
  lastUpdated?: number | null;
  /** 7D/30D/90D/YTD/all-time for the rest of the footer strip. */
  periods?: { d7: number | null; d30: number | null; d90: number | null; ytd: number | null; allTime: number | null } | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [mode, setMode] = useState<Mode>("candles");
  const [metric, setMetric] = useState<Metric>("price");
  const [hover, setHover] = useState<Candle | null>(null);
  const [hoverEvents, setHoverEvents] = useState<ChartEvent[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  /** Plot height while expanded. Null whenever the card sits inline. */
  const [fsHeight, setFsHeight] = useState<number | null>(null);
  /** Logical index range currently on screen, for the header's change readout. */
  const [vis, setVis] = useState<{ from: number; to: number } | null>(null);
  /** Last intraday response, tagged with the timeframe that asked for it. */
  const [feed, setFeed] = useState<{ tf: Timeframe; candles: Candle[]; error: string | null } | null>(null);

  const intra = isIntraday(timeframe);
  const fetchable = intra && !!slug;
  // Derived rather than stored: a stale tag *is* the pending state, so no
  // effect has to write loading flags back into render.
  const ready = feed?.tf === timeframe;
  const loading = fetchable && !ready;

  // Sub-daily bars have no archive — fetch them per timeframe. 1D/1W/1M fold
  // out of the daily candles the page already sent, so they never round-trip.
  useEffect(() => {
    if (!fetchable) return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/candles?slug=${encodeURIComponent(slug)}&tf=${encodeURIComponent(timeframe)}`,
          { signal: ac.signal }
        );
        const body = await res.json();
        if (ac.signal.aborted) return;
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
        const got: Candle[] = body.candles ?? [];
        setFeed({
          tf: timeframe,
          candles: got,
          error: got.length ? null : `No ${timeframe} candles are published for this pool.`,
        });
      } catch (err) {
        if (ac.signal.aborted) return;
        setFeed({
          tf: timeframe,
          candles: [],
          error: err instanceof Error ? err.message : "Could not load candles.",
        });
      }
    })();
    return () => ac.abort();
  }, [fetchable, timeframe, slug]);

  /**
   * Expanded view.
   *
   * Presentation only: the card is lifted to an overlay and the plot is handed
   * the height that frees up. Nothing about the chart changes — the existing
   * resize observer picks up the new width by itself, and the height travels
   * the same prop path an inline render already uses, so zoom, pan, crosshair
   * and the series all behave identically at either size.
   *
   * The first measurement is taken in the click handler rather than in an
   * effect, so entering fullscreen is one render instead of a render followed
   * by a corrective one.
   */
  const openFullscreen = useCallback(() => {
    setFsHeight(expandedPlotHeight());
    setFullscreen(true);
  }, []);
  const closeFullscreen = useCallback(() => {
    setFullscreen(false);
    setFsHeight(null);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onResize = () => setFsHeight(expandedPlotHeight());
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeFullscreen(); };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    // The page behind the overlay must not scroll under it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen, closeFullscreen]);

  /** What the chart is actually built at: the expanded height, else the prop. */
  const plotHeight = fullscreen ? fsHeight ?? height : height;

  /**
   * Everything the timeframe has. The whole series is loaded so panning back
   * stays possible; only the *viewport* is sized to the width.
   */
  const data = useMemo(() => {
    // normalize() again on the client: the series is asserted on by the chart
    // library, and a duplicate timestamp from any source takes the page down.
    const series = intra
      ? (ready ? normalize(feed!.candles) : [])
      : fromDaily(candles, timeframe);

    if (metric === "price" || !circulatingSupply) return series;
    // Market cap is the same shape scaled by supply, so OHLC ordering and the
    // volume pane are untouched. Supply is today's figure applied to every bar:
    // we hold no supply history, so early bars are stated at the current float.
    return series.map((c) => ({
      ...c,
      o: c.o * circulatingSupply,
      h: c.h * circulatingSupply,
      l: c.l * circulatingSupply,
      c: c.c * circulatingSupply,
    }));
  }, [candles, timeframe, intra, ready, feed, metric, circulatingSupply]);

  // The resize observer and range subscription outlive any one render, so they
  // read the series through a ref rather than a stale closure.
  const dataRef = useRef<Candle[]>(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  /**
   * Show the last N bars, where N is however many fit at the target pitch.
   * Called on every data change and every resize, so the window follows the
   * chart's width instead of a user-picked range.
   */
  const fitToWidth = useCallback(() => {
    const chart = chartRef.current;
    const n = dataRef.current.length;
    if (!chart || n === 0) return;
    const ts = chart.timeScale();
    const plot = ts.width() || wrapRef.current?.clientWidth || 0;
    if (plot <= 0) return;
    const capacity = Math.max(MIN_BARS, Math.floor(plot / BAR_PX));
    // Fewer bars than the width holds: spread them out rather than leave a gap.
    if (n <= capacity) { ts.fitContent(); return; }
    ts.setVisibleLogicalRange({ from: n - capacity, to: n - 1 + RIGHT_PAD_BARS });
  }, []);

  /**
   * Every event family renders. The legend that used to switch a family off is
   * gone, so there is nothing left to filter by — the markers themselves, and
   * the hover cards behind them, are unchanged.
   */
  const visibleEvents = events;

  const last = data.length ? data[data.length - 1] : null;
  const shown = hover ?? last;

  /**
   * With the range picker gone, the only period a reader can see is the one on
   * screen — so the change is quoted over exactly that, and labelled with the
   * span it covers rather than a range name that no longer exists.
   */
  const period = useMemo(() => {
    if (data.length < 2) return null;
    const from = Math.min(Math.max(0, vis?.from ?? 0), data.length - 1);
    const to = Math.min(Math.max(from, vis?.to ?? data.length - 1), data.length - 1);
    const a = data[from], b = data[to];
    if (a.o <= 0 || b.ts <= a.ts) return null;
    return { change: ((b.c - a.o) / a.o) * 100, seconds: b.ts - a.ts };
  }, [data, vis]);

  // price precision: these tokens range from $5 to $0.001
  const precision = useMemo(() => {
    const p = last?.c ?? 1;
    if (p >= 100) return 2;
    if (p >= 1) return 4;
    if (p >= 0.01) return 5;
    return 8;
  }, [last]);

  // build chart once
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: T.muted,
        fontSize: 11,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        attributionLogo: false,
        // The price and volume panes read as one chart, so the separator is
        // dropped rather than drawn — the library's default is a light rule
        // that cuts straight across the middle. Resizing goes with it: the
        // volume pane is pinned at a fixed height anyway.
        panes: {
          enableResize: false,
          separatorColor: "transparent",
          separatorHoverColor: "transparent",
        },
      },
      grid: {
        // Verticals are dropped: the time axis already carries the reading, and
        // a column behind every few bars is what made the plot look boxed in.
        vertLines: { visible: false },
        horzLines: { color: T.gridSoft, style: LineStyle.Solid },
      },
      rightPriceScale: {
        borderColor: T.axis,
        scaleMargins: { top: 0.1, bottom: 0.08 },
      },
      timeScale: {
        borderColor: T.axis,
        timeVisible: false,
        rightOffset: 4,
        fixLeftEdge: true,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: T.muted, width: 1, style: LineStyle.Dashed, labelBackgroundColor: T.axis },
        horzLine: { color: T.muted, width: 1, style: LineStyle.Dashed, labelBackgroundColor: T.axis },
      },
      localization: {
        // One formatter serves both panes: token prices sit below ~$100 while
        // volumes sit above $1k, so magnitude decides the treatment.
        priceFormatter: (p: number) =>
          p >= 1e9 ? `$${(p / 1e9).toFixed(1)}B`
            : p >= 1e6 ? `$${(p / 1e6).toFixed(1)}M`
              : p >= 1e3 ? `$${(p / 1e3).toFixed(0)}K`
                : p >= 1 ? `$${p.toFixed(2)}`
                  : p >= 0.01 ? `$${p.toFixed(3)}`
                    : p > 0 ? `$${p.toFixed(6)}`
                      : "$0",
      },
    });
    chartRef.current = chart;

    /**
     * Stretch the price axis with a trackpad, over the price scale only.
     *
     * The library scales price on `axisPressedMouseMove` — click the scale and
     * drag — which is a mouse gesture. On a trackpad that means press-drag with
     * one finger while the natural motion is a two-finger scroll, so the axis
     * read as fixed unless you knew to grab it.
     *
     * Bounded to the price column deliberately. Over the candles two fingers
     * still zooms time, which is the library's default and the one gesture that
     * would otherwise change meaning depending on where the pointer sat.
     *
     * Implemented through scaleMargins rather than a fixed visible range so
     * autoScale keeps working: the data still fits itself, into a taller or
     * shorter band. A fixed range would freeze the axis and strand the price
     * off-screen the moment the visible window moved.
     */
    const MARGIN_MIN = 0;
    const MARGIN_MAX = 0.42;
    const onWheel = (e: WheelEvent) => {
      const priceScale = chart.priceScale("right");
      const scaleWidth = priceScale.width();
      const rect = el.getBoundingClientRect();
      // Over the candles: leave it to the library, which prevents default
      // itself while zooming time.
      if (scaleWidth <= 0 || e.clientX < rect.right - scaleWidth) return;

      e.preventDefault();
      const { top = 0.1, bottom = 0.08 } = priceScale.options().scaleMargins ?? {};
      // Scrolling down compresses, matching the direction the axis moves when
      // dragged down. A fixed step rather than a multiplier so a margin already
      // at zero can still grow back.
      const step = e.deltaY > 0 ? 0.02 : -0.02;
      const clamp = (v: number) => Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, v));
      const next = { top: clamp(top + step), bottom: clamp(bottom + step) };
      if (next.top === top && next.bottom === bottom) return;
      priceScale.applyOptions({ scaleMargins: next });
    };
    // Not passive: the whole point is to stop the page scrolling underneath.
    el.addEventListener("wheel", onWheel, { passive: false });

    // Re-fitting on resize is what makes the window follow the width: a phone
    // in portrait gets fewer bars than the same chart rotated, with no input.
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
      sizeVolumePane(chart);
      fitToWidth();
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    // A trackpad pan fires this far faster than 60Hz — each tick was
    // triggering its own React re-render of the header readout, competing
    // with the chart's own canvas redraw for the main thread and turning a
    // two-finger swipe into a stutter. Collapsing every tick within a frame
    // down to one setVis, holding only the latest range, keeps the state
    // update at the display's refresh rate instead of the input's.
    let pendingRange: { from: number; to: number } | null = null;
    let rafId: number | null = null;
    const onRange = (r: { from: number; to: number } | null) => {
      if (!r) return;
      const n = dataRef.current.length;
      if (!n) return;
      pendingRange = { from: Math.max(0, Math.floor(r.from)), to: Math.min(n - 1, Math.ceil(r.to)) };
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const next = pendingRange;
        if (!next) return;
        setVis((prev) => (prev && prev.from === next.from && prev.to === next.to ? prev : next));
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      if (rafId != null) cancelAnimationFrame(rafId);
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volRef.current = null;
    };
  }, [height, fitToWidth]);

  /**
   * Apply the expanded height to the live chart.
   *
   * Deliberately a resize and not a rebuild. Routing the height through
   * `createChart` would tear the chart down and stand a new one up, and the
   * series effect below is keyed on the data — not on the chart instance — so
   * the replacement would come back empty. `applyOptions` keeps the same chart,
   * which also keeps its series, its zoom and the crosshair subscription.
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({ height: plotHeight });
    sizeVolumePane(chart);
    fitToWidth();
  }, [plotHeight, fitToWidth]);

  // (re)build series when the display mode changes.
  //
  // Deliberately NOT keyed on precision. Removing the last series in a pane
  // destroys the pane, and the replacement is created at a default height — so
  // switching to market cap (which changes precision, 6.19 -> 124M) used to
  // hand most of the chart to the volume histogram. Precision is applied to the
  // live series instead, below.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (priceRef.current) { chart.removeSeries(priceRef.current); priceRef.current = null; }
    if (volRef.current) { chart.removeSeries(volRef.current); volRef.current = null; }

    // No priceFormat here: the precision effect below applies it, which keeps
    // this effect off `precision` and so off the rebuild path entirely.
    priceRef.current =
      mode === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor: T.up, downColor: T.down,
            borderUpColor: T.up, borderDownColor: T.down,
            wickUpColor: T.up, wickDownColor: T.down,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: T.accent, lineWidth: 2,
            topColor: "rgba(57,135,229,0.28)", bottomColor: "rgba(57,135,229,0)",
          });

    // Volume goes in its own pane (index 1). Sharing the price pane made the
    // price axis autoscale through zero and draw negative ticks.
    volRef.current = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: {
          type: "custom",
          minMove: 1,
          // Raw volume ticks like "$50000000.00" are unreadable; abbreviate.
          formatter: (v: number) =>
            v >= 1e9 ? `${(v / 1e9).toFixed(1)}B`
              : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M`
                : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K`
                  : v.toFixed(0),
        },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1
    );
    sizeVolumePane(chart);
  }, [mode]);

  // Precision follows the magnitude on screen — market cap runs six orders
  // larger than price — and is applied to the live series so that changing it
  // never tears a pane down. Runs straight after the builder above on a mode
  // change, so a freshly created series is formatted before it draws.
  useEffect(() => {
    priceRef.current?.applyOptions({
      priceFormat: { type: "price", precision, minMove: Math.pow(10, -precision) },
    });
  }, [precision, mode]);

  // Daily and above are labelled by date; sub-daily needs the clock.
  useEffect(() => {
    chartRef.current?.applyOptions({ timeScale: { timeVisible: intra, secondsVisible: false } });
  }, [intra]);

  // push data + markers
  useEffect(() => {
    const chart = chartRef.current;
    const price = priceRef.current;
    const vol = volRef.current;
    if (!chart || !price || !vol) return;

    // An empty series must be pushed, not skipped — otherwise a timeframe with
    // no candles keeps drawing the previous one's bars.
    if (data.length === 0) {
      price.setData([]);
      vol.setData([]);
      return;
    }

    if (mode === "candles") {
      (price as ISeriesApi<"Candlestick">).setData(
        data.map((c) => ({ time: c.ts as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c }))
      );
    } else {
      (price as ISeriesApi<"Area">).setData(
        data.map((c) => ({ time: c.ts as UTCTimestamp, value: c.c }))
      );
    }

    vol.setData(
      data.map((c) => ({
        time: c.ts as UTCTimestamp,
        value: c.v,
        color: c.c >= c.o ? "rgba(12,163,12,0.45)" : "rgba(208,59,59,0.45)",
      }))
    );

    // Skip the first two sessions: a marker drawn on the leading candle
    // overlaps the price axis and renders as a stray blob.
    const lo = data[Math.min(2, data.length - 1)].ts;
    const hi = data[data.length - 1].ts;
    const markers: SeriesMarker<Time>[] = visibleEvents
      .filter((e) => e.time >= lo && e.time <= hi)
      .sort((a, b) => a.time - b.time)
      .map((e) => ({
        time: e.time as UTCTimestamp,
        position: "aboveBar" as const,
        color: (e.type && GROUP_OF.get(e.type)?.color) ?? T.muted,
        shape: "arrowDown" as const,
        text: e.label,
      }));
    createSeriesMarkers(price, markers);

    sizeVolumePane(chart);
    fitToWidth();
  }, [data, visibleEvents, mode, fitToWidth]);

  // crosshair → OHLC readout
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const byTime = new Map(data.map((c) => [c.ts, c]));
    // Events land on a day; match them to the nearest candle so hovering the
    // marker's bar surfaces what happened there. The tolerance follows the bar
    // length, so a day-stamped event cannot smear onto an arbitrary 1m bar.
    const evByDay = new Map<number, ChartEvent[]>();
    for (const e of visibleEvents) {
      let best: number | null = null, bestGap = Infinity;
      for (const c of data) {
        const gap = Math.abs(c.ts - e.time);
        if (gap < bestGap) { bestGap = gap; best = c.ts; }
      }
      if (best != null && bestGap <= TF_SECONDS[timeframe]) {
        evByDay.set(best, [...(evByDay.get(best) ?? []), e]);
      }
    }
    const handler = (param: { time?: Time }) => {
      const t = param.time as number | undefined;
      setHover(t ? byTime.get(t) ?? null : null);
      setHoverEvents(t ? evByDay.get(t) ?? [] : []);
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [data, visibleEvents, timeframe]);

  if (candles.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-[13px] text-muted">
        No price history available yet.
      </div>
    );
  }

  // Prices sit below ~$100 and market caps above $1M, so the same readout has
  // to span both — "$22684693.00" is unreadable where "$22.68M" is not.
  const fmtP = (n: number | undefined) =>
    n == null ? "—"
      : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
        : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
          : n >= 1e4 ? `$${(n / 1e3).toFixed(1)}K`
            : n >= 1 ? `$${n.toFixed(2)}`
              : `$${n.toPrecision(4)}`;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-page p-4 sm:p-6"
          : undefined
      }
    >
      {/* Identity, price and the market row. Stacks on narrow screens and only
          splits into two columns once there is width for both to breathe. */}
      {/* Identity and market figures sit side by side only once the card is wide
          enough for both. Below that they stack, which is what keeps the pair,
          price and change on a single line at ordinary desktop widths — the
          alternative was a two-column split that crushed the price into a wrap. */}
      <div className="flex flex-col gap-3 border-b border-line pb-3 2xl:flex-row 2xl:items-start 2xl:justify-between 2xl:gap-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Logo src={imageUrl} name={name} size={38} />
          <div className="min-w-0">
            {/* Pair, price and change share one baseline: the three figures are
                read together, and stacking them was what made the header tall.
                They wrap as a group on narrow screens rather than overflowing. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[16px] font-semibold leading-tight text-ink">
                {symbol}
                <span className="font-normal text-muted"> / USD</span>
              </h2>
              <span className="num text-[26px] font-semibold leading-none tracking-tight text-ink">
                {fmtP(shown?.c)}
              </span>
              {period && !hover && (
                <DeltaChip pct={period.change} period={spanLabel(period.seconds)} />
              )}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted">{name} Price</div>

            {/* Crosshair readout. Unchanged in what it reports — only quieter,
                so the price above stays the largest thing in the header. */}
            {shown && (
              <div className="num mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                <span>O <span className="text-ink2">{fmtP(shown.o)}</span></span>
                <span>H <span className="text-ink2">{fmtP(shown.h)}</span></span>
                <span>L <span className="text-ink2">{fmtP(shown.l)}</span></span>
                <span>C <span className="text-ink2">{fmtP(shown.c)}</span></span>
                <span className="hidden sm:inline">
                  VOL <span className="text-ink2">
                    ${shown.v >= 1e6 ? `${(shown.v / 1e6).toFixed(2)}M` : shown.v >= 1e3 ? `${(shown.v / 1e3).toFixed(1)}K` : shown.v.toFixed(0)}
                  </span>
                </span>
                <span>
                  {new Date(shown.ts * 1000).toLocaleString("en-US", {
                    month: "short", day: "numeric",
                    ...(intra
                      ? { hour: "2-digit", minute: "2-digit", hour12: false }
                      : { year: "numeric" }),
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Market row. Two columns on a phone, three once there is room, and a
            single line only on a genuinely wide desktop — flattening it earlier
            eats the width the pair/price/change row needs to stay on one line. */}
        <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 2xl:flex 2xl:items-start 2xl:gap-7">
          <MarketStat label="Market Cap" value={marketCap == null ? "—" : fmtUsd(marketCap, { compact: true })} />
          <MarketStat label="Volume (24h)" value={volume24h == null ? "—" : fmtUsd(volume24h, { compact: true })} />
          <MarketStat
            label="Circulating Supply"
            value={circulatingSupply == null ? "—" : `${fmtNum(circulatingSupply)} ${symbol}`}
          />
          <MarketStat
            label="Last updated"
            value={
              // Date and time are formatted separately and joined with a space:
              // asking toLocaleString for both yields "Aug 6, 2026, 00:00", and
              // the second comma reads as a typo.
              lastUpdated == null ? "—" : `${fmtUtcStamp(lastUpdated)} (UTC)`
            }
          />
        </div>
      </div>

      {/* Toolbar: what is measured on the left, over what interval on the right. */}
      <div className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex shrink-0 items-center gap-2">
          {circulatingSupply ? (
            <SegGroup label="Chart metric">
              <SegButton active={metric === "price"} onClick={() => setMetric("price")}>
                Price
              </SegButton>
              <SegButton active={metric === "mcap"} onClick={() => setMetric("mcap")}>
                Market Cap
              </SegButton>
            </SegGroup>
          ) : (
            // Without a supply figure a market cap would be fabricated, so the
            // switch is withheld rather than offered and left dead.
            <SegGroup>
              <span className="px-2 py-1.5 text-[11px] leading-none text-muted">Price</span>
            </SegGroup>
          )}
          <SegGroup label="Series type">
            <IconButton active={mode === "candles"} onClick={() => setMode("candles")} label="Candlestick">
              <CandlesIcon />
            </IconButton>
            <IconButton active={mode === "area"} onClick={() => setMode("area")} label="Line">
              <LineIcon />
            </IconButton>
          </SegGroup>
        </div>

        <div className="flex min-w-0 items-center gap-2 lg:justify-end">
          {/* The interval strip is the one control that can outgrow a phone,
              so it is the one that scrolls rather than wrapping. */}
          <div className="scroll-x-quiet min-w-0 flex-1 lg:flex-none">
            <SegGroup label="Candle interval" className="w-max">
              {OFFERED_TIMEFRAMES.map((tf) => (
                <SegButton key={tf} active={timeframe === tf} onClick={() => setTimeframe(tf)}>
                  {tf}
                </SegButton>
              ))}
            </SegGroup>
          </div>

          <SegGroup label="Chart tools">
            <UtilityButton label="Custom date range" disabled>
              <CalendarIcon />
            </UtilityButton>
            <UtilityButton label="Export data" disabled>
              <DownloadIcon />
            </UtilityButton>
            <UtilityButton
              label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={fullscreen ? closeFullscreen : openFullscreen}
            >
              <FullscreenIcon on={fullscreen} />
            </UtilityButton>
          </SegGroup>
        </div>
      </div>

      <div className="relative">
        <div ref={wrapRef} className="w-full" />

        {(loading || (intra && data.length === 0)) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md border border-line bg-surface/95 px-3 py-1.5 text-[12px] text-muted backdrop-blur">
              {loading
                ? `Loading ${timeframe} candles…`
                : !slug
                  ? "Intraday candles are unavailable here."
                  : (ready && feed!.error) || `No ${timeframe} candles available.`}
            </span>
          </div>
        )}

        {hoverEvents.length > 0 && (
          <div className="pointer-events-none absolute left-2 top-2 max-w-sm rounded-md border border-line bg-surface/95 p-2.5 shadow-xl backdrop-blur">
            {hoverEvents.map((e, i) => {
              const g = e.type ? GROUP_OF.get(e.type) : undefined;
              return (
                <div key={i} className={i > 0 ? "mt-2 border-t border-grid pt-2" : ""}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g?.color ?? T.muted }} />
                    <span className="text-[10px] uppercase tracking-wide text-muted">
                      {g?.label ?? e.type?.replace(/_/g, " ") ?? "event"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] font-medium text-ink">{e.title}</div>
                  {e.detail && <div className="mt-0.5 text-[11px] leading-snug text-ink2">{e.detail}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Period strip. 24h comes from the live quote (`price_snapshots.change_24h`);
          the rest are close-to-close against our own candle history, computed
          in `periodReturns` rather than here — this component stays
          presentational, and a period the token's history doesn't reach back
          to renders null from that function rather than a fabricated figure. */}
      <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface2/30 sm:grid-cols-6">
        {([
          ["24H", change24h],
          ["7D", periods?.d7 ?? null],
          ["30D", periods?.d30 ?? null],
          ["90D", periods?.d90 ?? null],
          ["YTD", periods?.ytd ?? null],
          ["All time", periods?.allTime ?? null],
        ] as const).map(([label, value], i) => (
          <div
            key={label}
            className={`border-line ${i % 3 !== 2 ? "border-r" : ""} ${i < 3 ? "border-b sm:border-b-0" : ""} sm:border-b-0 ${i !== 5 ? "sm:border-r" : "sm:border-r-0"}`}
          >
            <PeriodStat label={label} value={value} />
          </div>
        ))}
      </div>
    </div>
  );
}
