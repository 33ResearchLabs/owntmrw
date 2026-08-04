import { db } from "./db";
import { pairsForMints } from "./sources/dexscreener";
import { jupPrices } from "./sources/jupiter";
import { capFromSupply, isUndistributed } from "./quote";

/**
 * Live market quotes, fetched at request time.
 *
 * The SQLite store is a permanent archive written by `npm run ingest`, so on a
 * deployment that only re-ingests occasionally its newest price snapshot can be
 * days old. History, holders, treasury and governance are genuinely archival and
 * read from there; price is not, so it is re-fetched per request and merged over
 * the snapshot.
 */

export interface LiveQuote {
  price_usd: number;
  mcap: number | null;
  fdv: number | null;
  liquidity_usd: number | null;
  vol24h: number | null;
  change_1h: number | null;
  change_24h: number | null;
  /** Jupiter serves price only — it carries no depth, volume or change. */
  source: "dexscreener" | "jupiter";
}

/**
 * Every page render wants the same quotes, so they are fetched once per window
 * for the whole token universe rather than once per page. Two upstream calls
 * cover all of it, which is why the project page costs no more than the screener.
 */
const FRESH_MS = 20_000;
/** After a failed refresh, serve the last good map briefly instead of retrying per request. */
const BACKOFF_MS = 5_000;

interface Cached { at: number; map: Map<string, LiveQuote>; ok: boolean }

let cached: Cached | null = null;
let inflight: Promise<Map<string, LiveQuote>> | null = null;

interface TokenRow {
  mint: string;
  circulating_supply: number | null;
  total_supply: number | null;
}

async function refresh(): Promise<Map<string, LiveQuote>> {
  const tokens = db()
    .prepare("SELECT mint, circulating_supply, total_supply FROM projects WHERE mint IS NOT NULL")
    .all() as TokenRow[];
  const supply = new Map(tokens.map((t) => [t.mint, t]));
  const mints = tokens.map((t) => t.mint);
  const out = new Map<string, LiveQuote>();
  if (!mints.length) return out;

  // Keep the request path snappy: one retry, short timeout. A miss falls back
  // to the stored snapshot rather than holding the render open.
  const pairs = await pairsForMints(mints, { retries: 1, timeoutMs: 6000 });

  for (const [mint, pair] of pairs) {
    const price = Number(pair.priceUsd);
    if (!Number.isFinite(price) || price <= 0) continue;
    const t = supply.get(mint);
    out.set(mint, {
      price_usd: price,
      mcap: capFromSupply(price, t?.circulating_supply, pair.marketCap),
      fdv: capFromSupply(price, t?.total_supply, pair.fdv),
      liquidity_usd: pair.liquidity?.usd ?? null,
      vol24h: pair.volume?.h24 ?? null,
      change_1h: pair.priceChange?.h1 ?? null,
      change_24h: pair.priceChange?.h24 ?? null,
      source: "dexscreener",
    });
  }

  // Tokens that trade only on MetaDAO's own AMM never appear on DexScreener.
  const missing = mints.filter((m) => !out.has(m));
  if (missing.length) {
    const prices = await jupPrices(missing);
    for (const [mint, price] of Object.entries(prices)) {
      if (!Number.isFinite(price) || price <= 0) continue;
      const t = supply.get(mint);
      out.set(mint, {
        price_usd: price,
        mcap: isUndistributed(t?.circulating_supply)
          ? null
          : capFromSupply(price, t?.circulating_supply, null),
        fdv: capFromSupply(price, t?.total_supply, null),
        liquidity_usd: null,
        vol24h: null,
        change_1h: null,
        change_24h: null,
        source: "jupiter",
      });
    }
  }

  return out;
}

/** Current quotes keyed by mint. Empty when every upstream is unreachable. */
export async function liveQuotes(): Promise<Map<string, LiveQuote>> {
  const now = Date.now();
  if (cached && now - cached.at < (cached.ok ? FRESH_MS : BACKOFF_MS)) return cached.map;
  if (inflight) return inflight;

  inflight = refresh()
    .then((map) => {
      // An empty result means every upstream failed; keep the last good map.
      const ok = map.size > 0;
      const merged = ok ? map : cached?.map ?? map;
      cached = { at: Date.now(), map: merged, ok };
      return merged;
    })
    .catch(() => {
      cached = { at: Date.now(), map: cached?.map ?? new Map(), ok: false };
      return cached.map;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** When the served quotes were fetched, for the freshness indicator. */
export function liveQuotesAsOf(): number | null {
  return cached?.at ?? null;
}

/** Snapshot fields a live quote replaces, with the venue's coverage respected. */
export interface QuotedFields {
  price_usd: number | null;
  mcap: number | null;
  fdv: number | null;
  liquidity_usd: number | null;
  vol24h: number | null;
  change_24h: number | null;
}

/**
 * Overlay a live quote on stored snapshot fields.
 *
 * Price, cap and FDV always come from the quote when there is one, so they are
 * all read from the same instant. Depth, volume and 24h change come from it only
 * when DexScreener served it — Jupiter has no such fields, and pairing a live
 * price with a days-old 24h change would read as a single coherent quote when
 * it is not.
 */
export function applyQuote<T extends QuotedFields>(row: T, q: LiveQuote | undefined): T {
  if (!q) return row;
  const venue = q.source === "dexscreener";
  return {
    ...row,
    price_usd: q.price_usd,
    mcap: q.mcap,
    fdv: q.fdv,
    liquidity_usd: venue ? q.liquidity_usd : row.liquidity_usd,
    vol24h: venue ? q.vol24h : row.vol24h,
    change_24h: venue ? q.change_24h : row.change_24h,
  };
}
