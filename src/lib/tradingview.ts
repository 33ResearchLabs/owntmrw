import type { Timeframe } from "./candles";

/**
 * TradingView Advanced Charts, drawing our own data.
 *
 * The library is not on npm. TradingView grants access to a private GitHub
 * repository (https://www.tradingview.com/advanced-charts/) — free, with
 * attribution — and its licence forbids redistributing it, so it is not
 * committed here and `public/charting_library/` is git-ignored. To install:
 *
 *   1. Apply for access, then clone `github.com/tradingview/charting_library`.
 *   2. Copy its `charting_library/` folder to `public/charting_library/`.
 *
 * The TradingView tab then works with no code change. Until the folder exists
 * the tab shows these steps instead of a chart.
 *
 * Data never comes from TradingView: `TradingViewChart.tsx` adapts the daily
 * archive the page already ships and `/api/candles` — the feed the native
 * chart draws — to the library's datafeed interface.
 */

export const TV_LIBRARY_PATH = "/charting_library/";
/** The build that exposes a `window.TradingView` global. */
export const TV_SCRIPT = `${TV_LIBRARY_PATH}charting_library.standalone.js`;

export const TV_DEFAULT_RESOLUTION = "1D";
export const TV_HEIGHT = 560;
/** How often an open intraday chart re-reads the feed for its last bar. */
export const TV_POLL_MS = 30_000;

/**
 * TradingView resolution → our timeframe, and the only resolutions offered in
 * its toolbar. Weekly and monthly are listed so they appear, but the library
 * folds them from daily bars itself (`has_weekly_and_monthly: false`), and 1m
 * is left out to match the native chart's toolbar.
 */
export const TV_RESOLUTIONS: Record<string, Timeframe> = {
  "5": "5m", "15": "15m", "30": "30m", "60": "1H", "240": "4H",
  "1D": "1D", "1W": "1W", "1M": "1M",
};

/**
 * Widget options other than the per-page ones (symbol, datafeed, container).
 * Colours are the tokens from `globals.css`; the library runs in its own
 * iframe, so it cannot read them as CSS variables.
 */
export const TV_WIDGET_OPTIONS: Partial<TVWidgetOptions> = {
  library_path: TV_LIBRARY_PATH,
  locale: "en",
  autosize: true,
  theme: "dark",
  timezone: "Etc/UTC",
  // One symbol per page, so the search box and compare tool have nothing to offer.
  disabled_features: [
    "header_symbol_search", "symbol_search_hot_key", "header_compare",
    "display_market_status", "popup_hints",
  ],
  enabled_features: [],
  loading_screen: { backgroundColor: "#1a1a19", foregroundColor: "#3987e5" },
  overrides: {
    "paneProperties.background": "#1a1a19",
    "paneProperties.backgroundType": "solid",
    "paneProperties.vertGridProperties.color": "#2c2c2a",
    "paneProperties.horzGridProperties.color": "#2c2c2a",
    "scalesProperties.textColor": "#898781",
    "scalesProperties.lineColor": "#2c2c2a",
    "mainSeriesProperties.candleStyle.upColor": "#0ca30c",
    "mainSeriesProperties.candleStyle.downColor": "#d03b3b",
    "mainSeriesProperties.candleStyle.borderUpColor": "#0ca30c",
    "mainSeriesProperties.candleStyle.borderDownColor": "#d03b3b",
    "mainSeriesProperties.candleStyle.wickUpColor": "#0ca30c",
    "mainSeriesProperties.candleStyle.wickDownColor": "#d03b3b",
  },
  studies_overrides: {
    "volume.volume.color.0": "rgba(208, 59, 59, 0.5)",
    "volume.volume.color.1": "rgba(12, 163, 12, 0.5)",
  },
};

/* ------------------------------------------------------------------------ */
/* The slice of the library's API this app calls.                            */
/* The real definitions are `charting_library.d.ts` in the library folder;   */
/* it is not bundled, so only what is used here is declared.                 */
/* ------------------------------------------------------------------------ */

/** `time` is in milliseconds, unlike everything else in the datafeed API. */
export interface TVBar {
  time: number; open: number; high: number; low: number; close: number; volume?: number;
}

export interface TVSymbolInfo {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  listed_exchange: string;
  format: "price" | "volume";
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  supported_resolutions: string[];
  intraday_multipliers: string[];
  daily_multipliers: string[];
  volume_precision: number;
  data_status: "streaming" | "endofday" | "delayed_streaming";
  visible_plots_set: "ohlcv" | "ohlc" | "c";
}

export interface TVPeriodParams {
  /** Seconds. Bars are wanted in [from, to). */
  from: number;
  to: number;
  /** Bars the chart needs; takes priority over `from` when they conflict. */
  countBack: number;
  firstDataRequest: boolean;
}

export interface TVMark {
  id: string | number;
  /** Seconds. */
  time: number;
  color: string | { border: string; background: string };
  text: string;
  label: string;
  labelFontColor: string;
  minSize: number;
}

export interface TVDatafeed {
  onReady(cb: (config: {
    supported_resolutions: string[];
    supports_marks: boolean;
    supports_timescale_marks: boolean;
    supports_time: boolean;
  }) => void): void;
  searchSymbols(
    userInput: string, exchange: string, symbolType: string, onResult: (items: unknown[]) => void,
  ): void;
  resolveSymbol(
    symbolName: string, onResolve: (info: TVSymbolInfo) => void, onError: (reason: string) => void,
  ): void;
  getBars(
    symbolInfo: TVSymbolInfo, resolution: string, period: TVPeriodParams,
    onResult: (bars: TVBar[], meta: { noData: boolean }) => void, onError: (reason: string) => void,
  ): void;
  subscribeBars(
    symbolInfo: TVSymbolInfo, resolution: string, onTick: (bar: TVBar) => void,
    listenerGuid: string, onResetCacheNeeded: () => void,
  ): void;
  unsubscribeBars(listenerGuid: string): void;
  getMarks?(
    symbolInfo: TVSymbolInfo, from: number, to: number,
    onResult: (marks: TVMark[]) => void, resolution: string,
  ): void;
}

export interface TVWidgetOptions {
  symbol: string;
  interval: string;
  container: HTMLElement;
  datafeed: TVDatafeed;
  library_path: string;
  locale: string;
  autosize: boolean;
  theme: "dark" | "light";
  timezone: string;
  disabled_features: string[];
  enabled_features: string[];
  loading_screen: { backgroundColor: string; foregroundColor: string };
  overrides: Record<string, string | number | boolean>;
  studies_overrides: Record<string, string | number | boolean>;
}

export interface TVWidget {
  onChartReady(cb: () => void): void;
  remove(): void;
}

declare global {
  interface Window {
    TradingView?: { widget: new (options: TVWidgetOptions) => TVWidget };
  }
}
