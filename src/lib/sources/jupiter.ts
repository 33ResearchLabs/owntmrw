import { getJSON } from "./http";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const META_MINT = "METADDFL6wWMWEoKTFJwcThTbUmtarRJZjRpzUvkxhr";

/**
 * A rolling activity window. Jupiter omits a field entirely when nothing
 * happened in it — a token with no sells carries `buyVolume` alone, and one
 * that never traded carries neither — so every member is optional and absence
 * is meaningful rather than zero.
 */
export interface JupStats {
  priceChange?: number;
  buyVolume?: number;
  sellVolume?: number;
}

export interface JupToken {
  id: string; name: string; symbol: string; icon?: string;
  holderCount?: number; fdv?: number; mcap?: number;
  totalSupply?: number; circSupply?: number;
  liquidity?: number; usdPrice?: number;
  launchpad?: string; website?: string; twitter?: string;
  stats1h?: JupStats; stats24h?: JupStats;
}

/**
 * Traded volume over a window, or null when the venue reported no activity.
 *
 * Summing buy and sell side matches how DexScreener quotes `volume.h24`, so the
 * two venues stay comparable in the same column. Null and zero are kept apart:
 * a token nobody traded has no volume figure to show, which is not the same as
 * a measured zero.
 */
export function jupVolume(s: JupStats | undefined): number | null {
  if (!s || (s.buyVolume == null && s.sellVolume == null)) return null;
  return (s.buyVolume ?? 0) + (s.sellVolume ?? 0);
}

/** Jupiter lite token search — free, no key. Includes holderCount + launchpad tag. */
export async function jupTokenSearch(query: string): Promise<JupToken[]> {
  const data = await getJSON<JupToken[]>(
    `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Full token records for many mints, keyed by mint.
 *
 * The search endpoint accepts a comma-separated list and returns one row per
 * mint, so this costs the same one call per 50 that `jupPrices` does while
 * carrying depth, 24h volume and price change alongside the price — all of
 * which the price-only endpoint drops. Verified against 22 mints in one request.
 */
export async function jupTokens(mints: string[]): Promise<Map<string, JupToken>> {
  const out = new Map<string, JupToken>();
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    for (const t of await jupTokenSearch(batch.join(","))) {
      if (t?.id) out.set(t.id, t);
    }
  }
  return out;
}

/** Jupiter lite price API — free, no key. Returns USD prices keyed by mint. */
export async function jupPrices(mints: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    const data = await getJSON<Record<string, { usdPrice?: number; price?: string | number }>>(
      `https://lite-api.jup.ag/price/v3?ids=${batch.join(",")}`
    );
    for (const [mint, v] of Object.entries(data ?? {})) {
      const p = v?.usdPrice ?? Number(v?.price);
      if (Number.isFinite(p)) out[mint] = p as number;
    }
  }
  return out;
}
