import { getJSON } from "./http";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const META_MINT = "METADDFL6wWMWEoKTFJwcThTbUmtarRJZjRpzUvkxhr";

export interface JupToken {
  id: string; name: string; symbol: string; icon?: string;
  holderCount?: number; fdv?: number; mcap?: number;
  totalSupply?: number; circSupply?: number;
  liquidity?: number; usdPrice?: number;
  launchpad?: string; website?: string; twitter?: string;
}

/** Jupiter lite token search — free, no key. Includes holderCount + launchpad tag. */
export async function jupTokenSearch(query: string): Promise<JupToken[]> {
  const data = await getJSON<JupToken[]>(
    `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`
  );
  return Array.isArray(data) ? data : [];
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
