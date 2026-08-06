import { db } from "./db";
import { pairsForMints } from "./sources/dexscreener";
import { jupTokens, jupVolume } from "./sources/jupiter";
import { treasuryAum } from "./sources/metadao";
import { capFromSupply, marketCap } from "./quote";

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
  /**
   * Which venue answered. Both carry depth, volume and change; Jupiter reports
   * them per rolling window and omits a window it has no activity for, so a
   * null here is "the venue reported none", never "this venue cannot say".
   */
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

  // Keep the request path snappy, but leave enough headroom that a slow venue
  // does not silently demote every token to the price-only fallback.
  const pairs = await pairsForMints(mints, { retries: 2, timeoutMs: 9000 });

  for (const [mint, pair] of pairs) {
    const price = Number(pair.priceUsd);
    if (!Number.isFinite(price) || price <= 0) continue;
    const t = supply.get(mint);
    out.set(mint, {
      price_usd: price,
      mcap: marketCap(price, t?.circulating_supply, pair.marketCap),
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
    const toks = await jupTokens(missing);
    for (const [mint, tok] of toks) {
      const price = tok.usdPrice;
      if (price == null || !Number.isFinite(price) || price <= 0) continue;
      const t = supply.get(mint);
      out.set(mint, {
        price_usd: price,
        mcap: marketCap(price, t?.circulating_supply, tok.mcap),
        fdv: capFromSupply(price, t?.total_supply, tok.fdv),
        liquidity_usd: tok.liquidity ?? null,
        vol24h: jupVolume(tok.stats24h),
        change_1h: tok.stats1h?.priceChange ?? null,
        change_24h: tok.stats24h?.priceChange ?? null,
        source: "jupiter",
      });
    }
  }

  return out;
}

/**
 * Kicks off a refresh if one isn't already running, deduped through
 * `inflight` regardless of how many stale requests arrive while it's out.
 */
function triggerQuoteRefresh(): Promise<Map<string, LiveQuote>> {
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
      return cached!.map;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/**
 * Current quotes keyed by mint. Empty when every upstream is unreachable.
 *
 * Stale-while-revalidate: a page render only ever waits on the network on the
 * very first request this process has ever served. After that, a stale cache
 * is served immediately and the refresh runs in the background for whoever
 * asks next — DexScreener is fetched one mint at a time with retries, and a
 * single slow token used to stall every concurrent page load behind it for
 * up to 20+ seconds. A price that's a few seconds staler than it could be
 * beats a page that hangs waiting for one.
 */
export async function liveQuotes(): Promise<Map<string, LiveQuote>> {
  const now = Date.now();
  if (cached && now - cached.at < (cached.ok ? FRESH_MS : BACKOFF_MS)) return cached.map;
  if (!cached) return triggerQuoteRefresh();

  triggerQuoteRefresh();
  return cached.map;
}

/**
 * DAO treasury balances, cached like the quotes.
 *
 * A stored snapshot of a treasury is wrong the moment the DAO spends, and
 * nothing about the page says so — the figure just quietly drifts. Worse, the
 * treasury/market-cap ratio divided a stale numerator by a live denominator,
 * mixing two timeframes in one number. A longer window than the price cache is
 * fine: vault balances move on governance time, not market time.
 */
const TREASURY_FRESH_MS = 120_000;

let treasuryCached: { at: number; map: Map<string, number>; ok: boolean } | null = null;
let treasuryInflight: Promise<Map<string, number>> | null = null;

function triggerTreasuryRefresh(): Promise<Map<string, number>> {
  if (treasuryInflight) return treasuryInflight;

  treasuryInflight = treasuryAum()
    .then((map) => {
      // Empty means the feed failed; hold the last good map rather than
      // blanking every treasury on the site.
      const ok = map.size > 0;
      const merged = ok ? map : treasuryCached?.map ?? map;
      treasuryCached = { at: Date.now(), map: merged, ok };
      return merged;
    })
    .catch(() => {
      treasuryCached = { at: Date.now(), map: treasuryCached?.map ?? new Map(), ok: false };
      return treasuryCached!.map;
    })
    .finally(() => {
      treasuryInflight = null;
    });

  return treasuryInflight;
}

/** Stale-while-revalidate, same reasoning as `liveQuotes` above. */
export async function liveTreasury(): Promise<Map<string, number>> {
  const now = Date.now();
  const ttl = treasuryCached?.ok ? TREASURY_FRESH_MS : BACKOFF_MS;
  if (treasuryCached && now - treasuryCached.at < ttl) return treasuryCached.map;
  if (!treasuryCached) return triggerTreasuryRefresh();

  triggerTreasuryRefresh();
  return treasuryCached.map;
}

/** When the served quotes were fetched, for the freshness indicator. */
export function liveQuotesAsOf(): number | null {
  return cached?.at ?? null;
}

/**
 * Which venue answered, by count. A production box can reach a venue the
 * development machine cannot (and did not, for DexScreener on Render), and
 * that failure is otherwise invisible — the page still renders, just with
 * quietly degraded numbers.
 */
export function liveQuoteSources(): Record<string, number> {
  const counts: Record<string, number> = { dexscreener: 0, jupiter: 0 };
  for (const q of cached?.map.values() ?? []) counts[q.source]++;
  return counts;
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
 * all read from the same instant.
 *
 * The point-in-time fields come from the quote or not at all. Pairing a live
 * price with stored ones is how a $6.81 price came to sit beside a 24h volume
 * of $4.98M when the real figure was $790K, so a venue that reports no volume
 * or change renders "—" rather than borrowing the snapshot's. This used to
 * blank them for every Jupiter-quoted token on the assumption that Jupiter
 * served price only; it carries both in its `stats24h` window, so the figures
 * now come through instead of being discarded.
 *
 * Depth is the exception: it moves slowly and gates whether returns are shown
 * at all, so a slightly stale pool size beats withholding every return metric.
 */
export function applyQuote<T extends QuotedFields>(row: T, q: LiveQuote | undefined): T {
  if (!q) return row;
  return {
    ...row,
    price_usd: q.price_usd,
    mcap: q.mcap,
    fdv: q.fdv,
    liquidity_usd: q.liquidity_usd ?? row.liquidity_usd,
    vol24h: q.vol24h,
    change_24h: q.change_24h,
  };
}
