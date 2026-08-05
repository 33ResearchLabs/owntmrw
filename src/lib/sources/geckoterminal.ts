import { getJSON, sleep } from "./http";

/** GeckoTerminal public API — free, no key, ~30 req/min. */
const BASE = "https://api.geckoterminal.com/api/v2";

export interface Candle { ts: number; o: number; h: number; l: number; c: number; v: number }

/** Daily OHLCV history for a pool (up to 1000 days). */
export async function dailyOHLCV(poolAddress: string, limit = 1000): Promise<Candle[]> {
  const data = await getJSON<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
    `${BASE}/networks/solana/pools/${poolAddress}/ohlcv/day?limit=${limit}`
  );
  await sleep(2100); // stay under public rate limit
  const list = data?.data?.attributes?.ohlcv_list ?? [];
  return list
    .map(([ts, o, h, l, c, v]) => ({ ts, o, h, l, c, v }))
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Sub-daily OHLCV for a pool. Unlike the daily history this is never stored —
 * it is fetched on the request path — so it deliberately skips the rate-limit
 * sleep the ingest loop needs; the route's cache is what keeps calls sparse.
 */
export async function intradayOHLCV(
  poolAddress: string,
  unit: "minute" | "hour",
  aggregate: number,
  limit = 1000
): Promise<Candle[] | null> {
  const data = await getJSON<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
    `${BASE}/networks/solana/pools/${poolAddress}/ohlcv/${unit}?aggregate=${aggregate}&limit=${limit}`,
    { retries: 2, timeoutMs: 9000 }
  );
  // null, not [] — clicking through the timeframes bursts past the public rate
  // limit, and a throttled response must not read as "this pool has no bars".
  if (!data) return null;
  const list = data?.data?.attributes?.ohlcv_list ?? [];
  return list
    .map(([ts, o, h, l, c, v]) => ({ ts, o, h, l, c, v }))
    .sort((a, b) => a.ts - b.ts);
}

/** Top pool address for a token, per GeckoTerminal. */
export async function topPoolForToken(mint: string): Promise<string | null> {
  const data = await getJSON<{
    data?: { relationships?: { top_pools?: { data?: { id: string }[] } } };
  }>(`${BASE}/networks/solana/tokens/${mint}`);
  await sleep(2100);
  const id = data?.data?.relationships?.top_pools?.data?.[0]?.id;
  return id ? id.replace(/^solana_/, "") : null;
}

export interface PoolRef { address: string; createdAt: number; liquidity: number }

/**
 * Every pool GeckoTerminal knows for a mint, newest liquidity first.
 * MetaDAO re-created its AMM pools during the June 2026 v0.6 migration, so a
 * token's full candle history is split across pools — the current pool only
 * holds ~51 days. Merging them is the only way to chart from the raise.
 */
export async function poolsForToken(mint: string): Promise<PoolRef[]> {
  const data = await getJSON<{
    data?: { attributes?: { address?: string; pool_created_at?: string; reserve_in_usd?: string } }[];
  }>(`${BASE}/networks/solana/tokens/${mint}/pools?page=1`);
  await sleep(2100);
  const out: PoolRef[] = [];
  for (const p of data?.data ?? []) {
    const a = p.attributes;
    if (!a?.address) continue;
    out.push({
      address: a.address,
      createdAt: a.pool_created_at ? Math.floor(Date.parse(a.pool_created_at) / 1000) : 0,
      liquidity: Number(a.reserve_in_usd) || 0,
    });
  }
  return out.sort((x, y) => y.liquidity - x.liquidity);
}

export interface PoolListing {
  exchange: string;
  pair: string;
  volumeUsd: number | null;
  liquidityUsd: number | null;
  url: string | null;
}

/** "meteora-damm-v2" → "Meteora DAMM V2" — GeckoTerminal only exposes the slug. */
function dexName(id: string): string {
  return id
    .split("-")
    .map((w) => (/^v\d+$/i.test(w) ? w.toLowerCase() : w.length <= 4 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Trading venues for a token, from its pools.
 *
 * CoinGecko's ticker list is richer — it is the only source of centralised
 * venues — but a token has to be *listed* on CoinGecko to appear there, which
 * excludes most of this book. GeckoTerminal indexes every pool on the chain
 * with no listing step, so it covers the tokens CoinGecko has never heard of.
 * On-chain only, by definition: nothing here can report a CEX.
 */
export async function poolListings(mint: string): Promise<PoolListing[] | null> {
  const data = await getJSON<{
    data?: {
      attributes?: { name?: string; volume_usd?: { h24?: string }; reserve_in_usd?: string; address?: string };
      relationships?: { dex?: { data?: { id?: string } } };
    }[];
  }>(`${BASE}/networks/solana/tokens/${mint}/pools?page=1`, { retries: 1, timeoutMs: 15000 });
  await sleep(2100);
  if (!data) return null;

  const merged = new Map<string, PoolListing>();
  for (const p of data.data ?? []) {
    const a = p.attributes;
    const dex = p.relationships?.dex?.data?.id;
    if (!a?.name || !dex) continue;
    const exchange = dexName(dex);
    // "AVICI / USDC" → "AVICI/USDC"
    const pair = a.name.replace(/\s*\/\s*/, "/").trim();
    const key = `${exchange}|${pair}`;
    const vol = Number(a.volume_usd?.h24);
    const liq = Number(a.reserve_in_usd);
    const existing = merged.get(key);
    if (existing) {
      // The same venue runs several pools for one pair; report it once.
      existing.volumeUsd = (existing.volumeUsd ?? 0) + (Number.isFinite(vol) ? vol : 0);
      existing.liquidityUsd = (existing.liquidityUsd ?? 0) + (Number.isFinite(liq) ? liq : 0);
      continue;
    }
    merged.set(key, {
      exchange,
      pair,
      volumeUsd: Number.isFinite(vol) ? vol : null,
      liquidityUsd: Number.isFinite(liq) ? liq : null,
      url: a.address ? `https://www.geckoterminal.com/solana/pools/${a.address}` : null,
    });
  }
  return [...merged.values()].sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
}

/** Token info (may include holder count and metadata). */
export async function tokenInfo(mint: string): Promise<{
  holders?: number;
  /**
   * Concentration straight from the same response as the holder count.
   *
   * Worth reading because the alternative is getTokenLargestAccounts, which the
   * public RPC throttles — so on a keyless deployment top-10 concentration was
   * simply absent. This arrives with a call already being made.
   */
  top10Pct?: number; top20Pct?: number;
  description?: string; websites?: string[];
  twitter?: string; telegram?: string; discord?: string; image?: string;
} | null> {
  const data = await getJSON<{
    data?: { attributes?: {
      holders?: {
        count?: number;
        distribution_percentage?: { top_10?: string; "11_20"?: string; "21_40"?: string; rest?: string };
      };
      description?: string; websites?: string[];
      twitter_handle?: string; telegram_handle?: string; discord_url?: string;
      image_url?: string;
    } };
  }>(`${BASE}/networks/solana/tokens/${mint}/info`);
  await sleep(2100);
  const a = data?.data?.attributes;
  if (!a) return null;
  // Percentages arrive as strings; a band that is absent is unknown, not zero.
  const band = (v: string | undefined) => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const dist = a.holders?.distribution_percentage;
  const top10 = band(dist?.top_10);
  const next10 = band(dist?.["11_20"]);
  return {
    holders: a.holders?.count,
    top10Pct: top10,
    top20Pct: top10 != null && next10 != null ? top10 + next10 : undefined,
    description: a.description,
    websites: a.websites,
    twitter: a.twitter_handle ? `https://x.com/${a.twitter_handle}` : undefined,
    telegram: a.telegram_handle ? `https://t.me/${a.telegram_handle}` : undefined,
    discord: a.discord_url,
    image: a.image_url && a.image_url !== "missing.png" ? a.image_url : undefined,
  };
}
