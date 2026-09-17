"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { fromDaily, isIntraday, normalize, type Candle, type Timeframe } from "@/lib/candles";
import { EVENT_GROUPS, type ChartEvent } from "@/components/PriceChart";
import {
  TV_DEFAULT_RESOLUTION, TV_HEIGHT, TV_POLL_MS, TV_RESOLUTIONS, TV_SCRIPT, TV_WIDGET_OPTIONS,
  type TVBar, type TVDatafeed, type TVMark, type TVPeriodParams, type TVSymbolInfo,
  type TVWidgetOptions,
} from "@/lib/tradingview";

/** Everything the datafeed needs to describe and serve one project. */
interface Feed {
  slug: string;
  symbol: string;
  name: string;
  /** The daily archive the page shipped — 1D/1W/1M never leave the browser. */
  daily: Candle[];
  events: ChartEvent[];
}

const RESOLUTIONS = Object.keys(TV_RESOLUTIONS);
/** Intraday bars served directly; the library folds any other intraday size from these. */
const INTRADAY_MULTIPLIERS = RESOLUTIONS.filter((r) => isIntraday(TV_RESOLUTIONS[r]));
/** A fetched intraday series is trusted for this long before a request re-reads it. */
const SERIES_TTL_MS = 60_000;

const GROUP_OF = new Map(EVENT_GROUPS.flatMap((g) => g.types.map((t) => [t, g] as const)));

function toBar(c: Candle): TVBar {
  return { time: c.ts * 1000, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v };
}

/**
 * `pricescale` must be a power of ten. Enough decimals for about five
 * significant figures on the last close — $4.7690 for META, eight decimals for
 * a sub-cent token — within what the axis can fit.
 */
function priceScale(last: number | undefined): number {
  if (!last || !Number.isFinite(last) || last <= 0) return 10_000;
  const decimals = Math.min(10, Math.max(2, Math.ceil(-Math.log10(last)) + 4));
  return 10 ** decimals;
}

/**
 * The library's datafeed, over the feeds the native chart already draws.
 *
 * Daily and coarser bars fold from the archive in memory. Intraday bars come
 * from `/api/candles` per timeframe, cached briefly, and the open chart polls
 * the same route for its last bar — there is no push feed behind it.
 *
 * Every callback is deferred with `setTimeout`: the library requires them to
 * be asynchronous, and a synchronous answer breaks its request bookkeeping.
 */
class ProjectDatafeed implements TVDatafeed {
  private series = new Map<Timeframe, { at: number; job: Promise<Candle[]> }>();
  private timers = new Map<string, number>();
  private readonly marks: TVMark[];

  constructor(private readonly feed: Feed) {
    this.marks = feed.events.map((ev, i) => {
      const g = ev.type ? GROUP_OF.get(ev.type) : undefined;
      const color = g?.color ?? "#898781";
      return {
        id: i, time: ev.time, color: { border: color, background: color },
        text: ev.title, label: ev.label.charAt(0), labelFontColor: "#ffffff", minSize: 16,
      };
    });
  }

  private load(tf: Timeframe, maxAgeMs = SERIES_TTL_MS): Promise<Candle[]> {
    if (!isIntraday(tf)) return Promise.resolve(fromDaily(this.feed.daily, tf));
    const hit = this.series.get(tf);
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.job;

    const job = fetch(
      `/api/candles?slug=${encodeURIComponent(this.feed.slug)}&tf=${encodeURIComponent(tf)}`
    ).then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      return normalize((body.candles ?? []) as Candle[]);
    });
    this.series.set(tf, { at: Date.now(), job });
    // A throttled read must not be served as "the series" for the next minute.
    job.catch(() => {
      if (this.series.get(tf)?.job === job) this.series.delete(tf);
    });
    return job;
  }

  onReady(cb: Parameters<TVDatafeed["onReady"]>[0]) {
    setTimeout(() => cb({
      supported_resolutions: RESOLUTIONS,
      supports_marks: this.marks.length > 0,
      supports_timescale_marks: false,
      supports_time: false,
    }), 0);
  }

  // One symbol per page: there is nothing to search.
  searchSymbols(_input: string, _exchange: string, _type: string, onResult: (items: unknown[]) => void) {
    setTimeout(() => onResult([]), 0);
  }

  resolveSymbol(_name: string, onResolve: (info: TVSymbolInfo) => void) {
    const { slug, symbol, name, daily } = this.feed;
    setTimeout(() => onResolve({
      name: symbol,
      ticker: slug,
      description: `${name} / USD`,
      type: "crypto",
      session: "24x7",
      timezone: "Etc/UTC",
      exchange: "Solana",
      listed_exchange: "Solana",
      format: "price",
      minmov: 1,
      pricescale: priceScale(daily[daily.length - 1]?.c),
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: false,
      supported_resolutions: RESOLUTIONS,
      intraday_multipliers: INTRADAY_MULTIPLIERS,
      daily_multipliers: ["1"],
      volume_precision: 2,
      data_status: "streaming",
      visible_plots_set: "ohlcv",
    }), 0);
  }

  getBars(
    _info: TVSymbolInfo, resolution: string, period: TVPeriodParams,
    onResult: (bars: TVBar[], meta: { noData: boolean }) => void, onError: (reason: string) => void,
  ) {
    const tf = TV_RESOLUTIONS[resolution];
    if (!tf) {
      setTimeout(() => onError(`Unsupported resolution ${resolution}.`), 0);
      return;
    }
    this.load(tf).then((candles) => {
      const fromMs = period.from * 1000, toMs = period.to * 1000;
      // Everything before `to`, and at least `countBack` bars of it when older
      // bars exist: the chart asks for a count first and a range second.
      let end = candles.findIndex((c) => c.ts * 1000 >= toMs);
      if (end === -1) end = candles.length;
      let start = candles.findIndex((c) => c.ts * 1000 >= fromMs);
      if (start === -1) start = end;
      start = Math.min(start, Math.max(0, end - period.countBack));
      const bars = candles.slice(start, end).map(toBar);
      // An empty answer with nothing older ends the chart's walk back in time.
      onResult(bars, { noData: bars.length === 0 });
    }, (err: unknown) => {
      onError(err instanceof Error ? err.message : "Could not load candles.");
    });
  }

  subscribeBars(_info: TVSymbolInfo, resolution: string, onTick: (bar: TVBar) => void, guid: string) {
    const tf = TV_RESOLUTIONS[resolution];
    // The daily archive only changes when the ingest runs; intraday is live.
    if (!tf || !isIntraday(tf)) return;
    let since = 0;
    const id = window.setInterval(() => {
      this.load(tf, 0).then((candles) => {
        // The current bar again with its latest close, plus any that opened
        // since the last poll — a tick may never step backwards in time.
        const fresh = since ? candles.filter((c) => c.ts >= since) : candles.slice(-1);
        for (const c of fresh) onTick(toBar(c));
        if (fresh.length) since = fresh[fresh.length - 1].ts;
      }).catch(() => { /* a throttled poll is simply retried next time */ });
    }, TV_POLL_MS);
    this.timers.set(guid, id);
  }

  unsubscribeBars(guid: string) {
    const id = this.timers.get(guid);
    if (id == null) return;
    clearInterval(id);
    this.timers.delete(guid);
  }

  /** The event families the native chart draws as markers, as marks on bars. */
  getMarks(_info: TVSymbolInfo, from: number, to: number, onResult: (marks: TVMark[]) => void) {
    setTimeout(() => onResult(this.marks.filter((m) => m.time >= from && m.time <= to)), 0);
  }

  /** Stop polling once the widget is gone. */
  dispose() {
    for (const id of this.timers.values()) clearInterval(id);
    this.timers.clear();
  }
}

type Library = "loading" | "ready" | "missing";

/**
 * TradingView Advanced Charts over this project's candles.
 *
 * The library is loaded from `public/charting_library/` (see
 * `src/lib/tradingview.ts` for why it is not bundled). The widget is created
 * once the script is on the page and torn down with the component, so
 * switching away from the tab and back does not leak a second instance.
 */
export function TradingViewChart({
  slug, symbol, name, candles, events = [],
}: {
  slug: string;
  symbol: string;
  name: string;
  /** Daily archive, as handed to the native chart. */
  candles: Candle[];
  events?: ChartEvent[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [library, setLibrary] = useState<Library>("loading");
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (library !== "ready" || !el || !window.TradingView) return;

    const datafeed = new ProjectDatafeed({ slug, symbol, name, daily: candles, events });
    const widget = new window.TradingView.widget({
      ...TV_WIDGET_OPTIONS,
      symbol: slug,
      interval: TV_DEFAULT_RESOLUTION,
      container: el,
      datafeed,
    } as TVWidgetOptions);
    widget.onChartReady(() => setChartReady(true));

    return () => {
      datafeed.dispose();
      widget.remove();
      setChartReady(false);
    };
  }, [library, slug, symbol, name, candles, events]);

  return (
    <div>
      <Script
        src={TV_SCRIPT}
        strategy="afterInteractive"
        onReady={() => setLibrary("ready")}
        onError={() => setLibrary("missing")}
      />

      <div
        className="relative overflow-hidden rounded-xl border border-line bg-surface2/40"
        style={{ height: TV_HEIGHT }}
      >
        <div ref={containerRef} className="h-full w-full" />

        {library === "missing" ? (
          <InstallNotice />
        ) : !chartReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md border border-line bg-surface/95 px-3 py-1.5 text-[12px] text-muted backdrop-blur">
              Loading TradingView…
            </span>
          </div>
        )}
      </div>

      {/* The chart is TradingView's; every number in it is ours. */}
      <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>Candles from GeckoTerminal via tekno.works — the same feed as the native chart.</span>
        <a
          href="https://www.tradingview.com/"
          target="_blank" rel="noopener noreferrer"
          className="text-ink2 transition-colors hover:text-brand"
        >
          Charting by TradingView ↗
        </a>
      </p>
    </div>
  );
}

/** Shown in place of the chart until the library folder exists. */
function InstallNotice() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-[12.5px] leading-relaxed text-ink2">
        <p className="font-medium text-ink">TradingView Advanced Charts is not installed.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Apply for access at{" "}
            <a
              href="https://www.tradingview.com/advanced-charts/"
              target="_blank" rel="noopener noreferrer"
              className="text-brand hover:text-brand-hi"
            >
              tradingview.com/advanced-charts
            </a>{" "}
            and clone <code className="num text-ink">tradingview/charting_library</code>.
          </li>
          <li>
            Copy its <code className="num text-ink">charting_library/</code> folder to{" "}
            <code className="num text-ink">public/charting_library/</code>.
          </li>
          <li>Reload — no code change is needed.</li>
        </ol>
        <p className="text-muted">
          Or turn the tab off with <code className="num">TRADINGVIEW_ENABLED</code> in{" "}
          <code className="num">src/lib/chartSources.ts</code>.
        </p>
      </div>
    </div>
  );
}
