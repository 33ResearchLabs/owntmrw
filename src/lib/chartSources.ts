/**
 * Which charts the project page offers, and how.
 *
 * The chart card is one tab strip over three kinds of source:
 *   - native      — `PriceChart`, our own Lightweight Charts build.
 *   - tradingview — TradingView Advanced Charts drawing *our* data through the
 *                   datafeed in `TradingViewChart.tsx` (see `tradingview.ts`).
 *   - embeds      — hosted charts: the provider serves both the data and the
 *                   UI from one address, so nothing touches `/api/candles`.
 *
 * To change what is offered, edit this file and nothing else:
 *   - `DEFAULT_CHART_SOURCE` — the tab a page opens on.
 *   - `TRADINGVIEW_ENABLED`  — whether the TradingView tab is offered.
 *   - `ENABLED_EMBEDS`       — which hosted providers get a tab, in that order.
 *   - `PRELOAD_EMBEDS`       — load them in the background so the tab opens instantly.
 *   - `EMBED_OPTIONS`        — theme, candle interval, chart style, extra panels.
 *   - `EMBED_PROVIDERS`      — how each provider's URL is built. To support a
 *                              new one, add a key to `EmbedProviderKey` and an
 *                              entry here.
 */

export type EmbedProviderKey = "dexscreener" | "geckoterminal" | "birdeye" | "dextools";

export type ChartSourceKey = "native" | "tradingview" | EmbedProviderKey;

/** Addresses the page knows for a token. Each provider picks the one it is keyed on. */
export interface EmbedIds {
  /** DexScreener's deepest pair for the mint — the pair the live quote comes from. */
  pair: string | null;
  /** The pool `/api/candles` reads, i.e. GeckoTerminal's. */
  pool: string | null;
  mint: string | null;
}

export interface EmbedOptions {
  theme: "dark" | "light";
  /** Candle interval in minutes (1440 = daily). */
  interval: 1 | 5 | 15 | 60 | 240 | 1440;
  style: "candles" | "line";
  /** Provider-side extras beyond the chart itself. */
  info: boolean;
  trades: boolean;
}

export interface EmbedProvider {
  label: string;
  /** Which address this embed is keyed on. Null means it cannot show this token. */
  id: (ids: EmbedIds) => string | null;
  /** The iframe `src`. */
  src: (id: string, o: EmbedOptions) => string;
  /** The same chart on the provider's own site, for the "Open on …" link. */
  site: (id: string) => string;
  /**
   * Frame height in px. Providers draw their own header and toolbar inside
   * the frame, so this is more than the native chart's plot alone.
   */
  height: number;
}

/* ------------------------------------------------------------------------ */
/* What is offered                                                           */
/* ------------------------------------------------------------------------ */

export const DEFAULT_CHART_SOURCE: ChartSourceKey = "native";

/**
 * The tab is offered even before the library is installed — it then shows
 * the install steps rather than a chart — so switch this off for a deploy
 * that will not ship `public/charting_library/`.
 */
export const TRADINGVIEW_ENABLED = true;

export const ENABLED_EMBEDS: EmbedProviderKey[] = ["dexscreener"];

/**
 * Load the enabled embeds in the background once the page is idle, so their
 * tab opens on a chart that is already drawn rather than on a spinner. Each
 * provider's whole app is downloaded on every project view for it, so it is
 * skipped on phone-width screens and when the browser asks to save data.
 */
export const PRELOAD_EMBEDS = true;

export const EMBED_OPTIONS: EmbedOptions = {
  theme: "dark",
  interval: 15,
  style: "candles",
  info: false,
  trades: false,
};

/* ------------------------------------------------------------------------ */
/* Providers                                                                 */
/* ------------------------------------------------------------------------ */

function qs(params: Record<string, string | number | boolean>): string {
  return new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
}

/** TradingView's chart-style enum, which DexScreener and DEXTools expose as-is. */
const TV_STYLE = { candles: 1, line: 2 } as const;

export const EMBED_PROVIDERS: Record<EmbedProviderKey, EmbedProvider> = {
  /** Free, no key. Parameters are the ones its embed builder emits. */
  dexscreener: {
    label: "DexScreener",
    id: (ids) => ids.pair,
    src: (id, o) =>
      `https://dexscreener.com/solana/${id}?` +
      qs({
        embed: 1,
        loadChartSettings: 0,
        tabs: 0,
        info: o.info ? 1 : 0,
        trades: o.trades ? 1 : 0,
        chartLeftToolbar: 0,
        chartDefaultOnMobile: 1,
        theme: o.theme,
        chartTheme: o.theme,
        chartStyle: TV_STYLE[o.style],
        chartType: "usd",
        interval: o.interval,
      }),
    site: (id) => `https://dexscreener.com/solana/${id}`,
    height: 560,
  },

  /** Free, no key. Keyed on the same pool the native chart's candles come from. */
  geckoterminal: {
    label: "GeckoTerminal",
    id: (ids) => ids.pool,
    src: (id, o) =>
      `https://www.geckoterminal.com/solana/pools/${id}?` +
      qs({
        embed: 1,
        info: o.info ? 1 : 0,
        swaps: o.trades ? 1 : 0,
        grayscale: 0,
        light_chart: o.theme === "light" ? 1 : 0,
        chart_type: "price",
        resolution:
          o.interval >= 1440 ? "1d" : o.interval >= 60 ? `${o.interval / 60}h` : `${o.interval}m`,
      }),
    site: (id) => `https://www.geckoterminal.com/solana/pools/${id}`,
    height: 560,
  },

  /**
   * Free widget, keyed on the mint. Parameters transcribed from Birdeye's
   * embed builder and not yet exercised here — check it in a browser before
   * adding it to `ENABLED_EMBEDS`.
   */
  birdeye: {
    label: "Birdeye",
    id: (ids) => ids.mint,
    src: (id, o) =>
      `https://birdeye.so/tv-widget/${id}?` +
      qs({
        chain: "solana",
        viewMode: "pair",
        chartInterval: o.interval >= 1440 ? "1D" : o.interval,
        chartType: o.style === "candles" ? "Candle" : "Line",
        chartLeftToolbar: "hide",
        theme: o.theme,
      }),
    site: (id) => `https://birdeye.so/token/${id}?chain=solana`,
    height: 560,
  },

  /**
   * Free widget, keyed on the pair. Parameters transcribed from DEXTools'
   * widget docs and not yet exercised here — check it in a browser before
   * adding it to `ENABLED_EMBEDS`.
   */
  dextools: {
    label: "DEXTools",
    id: (ids) => ids.pair ?? ids.pool,
    src: (id, o) =>
      `https://www.dextools.io/widget-chart/en/solana/pe-light/${id}?` +
      qs({
        theme: o.theme,
        chartType: TV_STYLE[o.style],
        chartResolution: o.interval >= 1440 ? "1D" : o.interval,
        drawingToolbars: false,
      }),
    site: (id) => `https://www.dextools.io/app/en/solana/pair-explorer/${id}`,
    height: 560,
  },
};
