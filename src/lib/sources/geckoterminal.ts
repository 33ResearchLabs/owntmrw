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

/** Token info (may include holder count and metadata). */
export async function tokenInfo(mint: string): Promise<{
  holders?: number; description?: string; websites?: string[];
  twitter?: string; telegram?: string; discord?: string; image?: string;
} | null> {
  const data = await getJSON<{
    data?: { attributes?: {
      holders?: { count?: number };
      description?: string; websites?: string[];
      twitter_handle?: string; telegram_handle?: string; discord_url?: string;
      image_url?: string;
    } };
  }>(`${BASE}/networks/solana/tokens/${mint}/info`);
  await sleep(2100);
  const a = data?.data?.attributes;
  if (!a) return null;
  return {
    holders: a.holders?.count,
    description: a.description,
    websites: a.websites,
    twitter: a.twitter_handle ? `https://x.com/${a.twitter_handle}` : undefined,
    telegram: a.telegram_handle ? `https://t.me/${a.telegram_handle}` : undefined,
    discord: a.discord_url,
    image: a.image_url && a.image_url !== "missing.png" ? a.image_url : undefined,
  };
}
