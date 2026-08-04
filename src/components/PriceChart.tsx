"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, ColorType, CandlestickSeries, AreaSeries, HistogramSeries,
  createSeriesMarkers, LineStyle,
  type IChartApi, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp,
} from "lightweight-charts";

export interface Candle { ts: number; o: number; h: number; l: number; c: number; v: number }
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

type Range = "7D" | "30D" | "90D" | "1Y" | "ALL";
type Mode = "candles" | "area";

const RANGE_DAYS: Record<Range, number> = { "7D": 7, "30D": 30, "90D": 90, "1Y": 365, ALL: Infinity };

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

export function PriceChart({
  candles, events = [], height = 470,
}: { candles: Candle[]; events?: ChartEvent[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [range, setRange] = useState<Range>("ALL");
  const [mode, setMode] = useState<Mode>("candles");
  const [hover, setHover] = useState<Candle | null>(null);
  const [hoverEvents, setHoverEvents] = useState<ChartEvent[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());

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

  const data = useMemo(() => {
    const sorted = [...candles].sort((a, b) => a.ts - b.ts);
    const days = RANGE_DAYS[range];
    if (!Number.isFinite(days)) return sorted;
    const cutoff = sorted.length ? sorted[sorted.length - 1].ts - days * 86400 : 0;
    const win = sorted.filter((c) => c.ts >= cutoff);
    return win.length >= 2 ? win : sorted;
  }, [candles, range]);

  const last = data.length ? data[data.length - 1] : null;
  const first = data.length ? data[0] : null;
  const shown = hover ?? last;
  const periodChange =
    first && last && first.o > 0 ? ((last.c - first.o) / first.o) * 100 : null;

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

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volRef.current = null;
    };
  }, [height]);

  // (re)build series when the display mode changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (priceRef.current) { chart.removeSeries(priceRef.current); priceRef.current = null; }
    if (volRef.current) { chart.removeSeries(volRef.current); volRef.current = null; }

    const priceFormat = { type: "price" as const, precision, minMove: Math.pow(10, -precision) };

    priceRef.current =
      mode === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor: T.up, downColor: T.down,
            borderUpColor: T.up, borderDownColor: T.down,
            wickUpColor: T.up, wickDownColor: T.down,
            priceFormat,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: T.accent, lineWidth: 2,
            topColor: "rgba(57,135,229,0.28)", bottomColor: "rgba(57,135,229,0)",
            priceFormat,
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
    const panes = chart.panes();
    if (panes[1]) panes[1].setHeight(86);
  }, [mode, precision]);

  // push data + markers
  useEffect(() => {
    const chart = chartRef.current;
    const price = priceRef.current;
    const vol = volRef.current;
    if (!chart || !price || !vol || data.length === 0) return;

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

    chart.timeScale().fitContent();
  }, [data, visibleEvents, mode]);

  // crosshair → OHLC readout
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const byTime = new Map(data.map((c) => [c.ts, c]));
    // Events land on a day; match them to the nearest candle so hovering the
    // marker's bar surfaces what happened there.
    const evByDay = new Map<number, ChartEvent[]>();
    for (const e of visibleEvents) {
      let best: number | null = null, bestGap = Infinity;
      for (const c of data) {
        const gap = Math.abs(c.ts - e.time);
        if (gap < bestGap) { bestGap = gap; best = c.ts; }
      }
      if (best != null && bestGap <= 86400) {
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
  }, [data, visibleEvents]);

  if (candles.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-[13px] text-muted">
        No price history available yet.
      </div>
    );
  }

  const fmtP = (n: number | undefined) =>
    n == null ? "—" : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(4)}`;

  return (
    <div>
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="num text-[20px] font-semibold">{fmtP(shown?.c)}</span>
          {periodChange != null && !hover && (
            <span className={`num text-[13px] ${periodChange >= 0 ? "text-good" : "text-bad"}`}>
              {periodChange >= 0 ? "▲" : "▼"} {Math.abs(periodChange).toFixed(1)}% <span className="text-muted">{range}</span>
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
              {new Date(shown.ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <div className="flex overflow-hidden rounded border border-line">
            {(["candles", "area"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[11px] capitalize transition-colors ${
                  mode === m ? "bg-white/10 text-ink" : "text-muted hover:text-ink2"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded border border-line">
            {(["7D", "30D", "90D", "1Y", "ALL"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-1 text-[11px] transition-colors ${
                  range === r ? "bg-white/10 text-ink" : "text-muted hover:text-ink2"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <div ref={wrapRef} className="w-full" />
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
