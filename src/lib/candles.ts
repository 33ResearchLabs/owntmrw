/**
 * Candle timeframes, shared by the chart, its API route and the ingest store.
 *
 * The SQLite archive holds daily candles only, so timeframes split two ways:
 * 1D/1W/1M are folded from that archive (instant, full history), while sub-daily
 * bars are fetched live from the pool's OHLCV feed — nothing intraday is stored.
 */

export interface Candle { ts: number; o: number; h: number; l: number; c: number; v: number }

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W" | "1M";

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

/**
 * Upstream request shape for the sub-daily timeframes. GeckoTerminal serves
 * minute aggregates of 1/5/15 and hour aggregates of 1/4 — 30m is not offered,
 * so it is folded from two 15m bars.
 */
export const INTRADAY: Record<string, { unit: "minute" | "hour"; aggregate: number; foldTo?: number }> = {
  "1m": { unit: "minute", aggregate: 1 },
  "5m": { unit: "minute", aggregate: 5 },
  "15m": { unit: "minute", aggregate: 15 },
  "30m": { unit: "minute", aggregate: 15, foldTo: 1800 },
  "1H": { unit: "hour", aggregate: 1 },
  "4H": { unit: "hour", aggregate: 4 },
};

export function isIntraday(tf: Timeframe): boolean {
  return tf in INTRADAY;
}

/** Bar length in seconds — used to size the duration windows sensibly. */
export const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1H": 3600, "4H": 14400,
  "1D": 86400, "1W": 604800, "1M": 2592000,
};

/**
 * Sort ascending and collapse repeated timestamps.
 *
 * The upstream feed does emit duplicates — a dead pool restating a minute, and
 * an hour (2026-06-23T19:00) repeated across five unrelated pools at once — and
 * the chart library asserts hard on a non-ascending series, taking the whole
 * page down with it. Every series is run through here before it is drawn.
 *
 * Volume takes the larger of the two rather than the sum: a repeat may be a
 * restatement (identical volume, so summing would double it) or a split bar
 * (distinct volume, so summing would be right), and the feed does not say
 * which. Overstating traded volume is the worse of the two errors.
 */
export function normalize(candles: Candle[]): Candle[] {
  const sorted = [...candles].sort((a, b) => a.ts - b.ts);
  const out: Candle[] = [];
  for (const c of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.ts === c.ts) {
      prev.h = Math.max(prev.h, c.h);
      prev.l = Math.min(prev.l, c.l);
      prev.c = c.c;
      prev.v = Math.max(prev.v, c.v);
      continue;
    }
    out.push({ ...c });
  }
  return out;
}

/**
 * Merge candles into larger buckets. `keyOf` maps a timestamp to its bucket
 * open; input must be sorted ascending.
 */
export function fold(candles: Candle[], keyOf: (ts: number) => number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const c of candles) {
    const k = keyOf(c.ts);
    if (!cur || k !== cur.ts) {
      if (cur) out.push(cur);
      cur = { ts: k, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Weeks open on Monday, matching how the exchanges label them. */
export function weekOpen(ts: number): number {
  const d = new Date(ts * 1000);
  const backToMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - backToMonday) / 1000;
}

export function monthOpen(ts: number): number {
  const d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
}

/** Fold the stored daily archive up to the requested timeframe. */
export function fromDaily(daily: Candle[], tf: Timeframe): Candle[] {
  const clean = normalize(daily);
  if (tf === "1W") return fold(clean, weekOpen);
  if (tf === "1M") return fold(clean, monthOpen);
  return clean;
}
