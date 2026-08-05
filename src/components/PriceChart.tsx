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
  axis: "#383835",
  muted: "#898781",
  ink: "#ffffff",
  surface: "#1a1a19",
};

/**
 * Price:volume height ratio. Volume is context for the bars above it, never the
 * subject, so it gets a fifth of the chart the way a desk terminal shows it.
 */
const PRICE_STRETCH = 4;
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
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ${
        active ? "bg-white/10 text-ink" : "text-muted hover:bg-white/5 hover:text-ink2"
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
      className={`shrink-0 rounded px-2 py-1.5 text-[11px] leading-none transition-colors sm:px-2.5 ${
        active ? "bg-white/10 font-medium text-ink" : "text-muted hover:bg-white/5 hover:text-ink2"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** What the y-axis measures. Market cap is price scaled by circulating supply. */
type Metric = "price" | "mcap";

export function PriceChart({
  candles, events = [], height = 470, slug, circulatingSupply = null,
}: {
  candles: Candle[];
  events?: ChartEvent[];
  height?: number;
  slug?: string;
  /** Enables the Market Cap switch. Without it the toggle is not offered. */
  circulatingSupply?: number | null;
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
  const [off, setOff] = useState<Set<string>>(new Set());
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

  /** Event families actually present in this project's data. */
  const presentGroups = useMemo(() => {
    const keys = new Set<string>();
    for (const e of events) {
      const g = e.type ? GROUP_OF.get(e.type) : undefined;
      if (g) keys.add(g.key);
    }
    return EVENT_GROUPS.filter((g) => keys.has(g.key));
  }, [events]);

  const visibleEvents = useMemo(
    () => events.filter((e) => {
      const g = e.type ? GROUP_OF.get(e.type) : undefined;
      return g ? !off.has(g.key) : true;
    }),
    [events, off]
  );

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
        vertLines: { color: T.grid, style: LineStyle.Solid },
        horzLines: { color: T.grid, style: LineStyle.Solid },
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

    // Re-fitting on resize is what makes the window follow the width: a phone
    // in portrait gets fewer bars than the same chart rotated, with no input.
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
      sizeVolumePane(chart);
      fitToWidth();
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    const onRange = (r: { from: number; to: number } | null) => {
      if (!r) return;
      const n = dataRef.current.length;
      if (!n) return;
      const from = Math.max(0, Math.floor(r.from));
      const to = Math.min(n - 1, Math.ceil(r.to));
      setVis((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volRef.current = null;
    };
  }, [height, fitToWidth]);

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
    <div>
      {/* readout */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="num text-[20px] font-semibold">{fmtP(shown?.c)}</span>
          {period && !hover && (
            <span className={`num text-[13px] ${period.change >= 0 ? "text-good" : "text-bad"}`}>
              {period.change >= 0 ? "▲" : "▼"} {Math.abs(period.change).toFixed(1)}%{" "}
              <span className="text-muted">{spanLabel(period.seconds)}</span>
            </span>
          )}
        </div>

        {shown && (
          <div className="num flex flex-wrap gap-x-3 text-[11px] text-muted">
            <span>O <span className="text-ink2">{fmtP(shown.o)}</span></span>
            <span>H <span className="text-ink2">{fmtP(shown.h)}</span></span>
            <span>L <span className="text-ink2">{fmtP(shown.l)}</span></span>
            <span>C <span className="text-ink2">{fmtP(shown.c)}</span></span>
            <span className="hidden sm:inline">
              VOL <span className="text-ink2">
                ${shown.v >= 1e6 ? `${(shown.v / 1e6).toFixed(2)}M` : shown.v >= 1e3 ? `${(shown.v / 1e3).toFixed(1)}K` : shown.v.toFixed(0)}
              </span>
            </span>
            <span className="text-muted">
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

      {/* Toolbar: what is measured on the left, over what interval on the right. */}
      <div className="flex items-center gap-2 border-y border-grid py-1">
        <div className="flex shrink-0 items-center gap-1">
          {circulatingSupply ? (
            <div className="flex items-center gap-0.5" role="group" aria-label="Chart metric">
              <SegButton active={metric === "price"} onClick={() => setMetric("price")}>
                Price
              </SegButton>
              <SegButton active={metric === "mcap"} onClick={() => setMetric("mcap")}>
                Market Cap
              </SegButton>
            </div>
          ) : (
            // Without a supply figure a market cap would be fabricated, so the
            // switch is withheld rather than offered and left dead.
            <span className="px-2 text-[11px] text-muted">Price</span>
          )}
          <span aria-hidden className="mx-0.5 h-4 w-px bg-grid" />
          <div className="flex items-center gap-0.5" role="group" aria-label="Series type">
            <IconButton active={mode === "candles"} onClick={() => setMode("candles")} label="Candlestick">
              <CandlesIcon />
            </IconButton>
            <IconButton active={mode === "area"} onClick={() => setMode("area")} label="Line">
              <LineIcon />
            </IconButton>
          </div>
        </div>

        <div
          className="scroll-x flex min-w-0 flex-1 items-center justify-end gap-0.5"
          role="group"
          aria-label="Candle interval"
        >
          {TIMEFRAMES.map((tf) => (
            <SegButton key={tf} active={timeframe === tf} onClick={() => setTimeframe(tf)}>
              {tf}
            </SegButton>
          ))}
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

      {presentGroups.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-grid pt-3">
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted">Events</span>
          {presentGroups.map((g) => {
            const on = !off.has(g.key);
            return (
              <button
                key={g.key}
                onClick={() =>
                  setOff((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                    return next;
                  })
                }
                className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] transition-opacity ${
                  on ? "text-ink2" : "text-muted opacity-50"
                } hover:bg-white/5`}
                aria-pressed={on}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: on ? g.color : "var(--ink-muted)" }}
                />
                {g.label}
              </button>
            );
          })}
          <span className="text-[11px] text-muted">· hover a marker for detail</span>
        </div>
      )}
    </div>
  );
}
