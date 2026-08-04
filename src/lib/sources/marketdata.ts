import { getJSON, sleep } from "./http";

/**
 * MetaDAO's own daily market-data ETL. This is the only public source that
 * reaches back to each token's raise — GeckoTerminal's free tier holds nothing
 * before the June 2026 AMM migration, so it alone cannot chart a full history.
 *
 * Both params are required (a missing endDate is a 400). Numerics arrive as
 * strings. Meteora rows carry `average_price`; futarchy-AMM rows carry volume
 * and fees but no price, so price history comes from the Meteora side and
 * volume is summed across both venues.
 */
const MARKET_API = "https://market-api.metadao.fi";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface MeteoraRow {
  token: string; date: string;
  average_price?: string; base_volume?: string; target_volume?: string;
  trade_count?: number;
}
interface FutarchyRow {
  token: string; date: string;
  total_target_volume?: string; total_base_volume?: string;
  spot_target_volume?: string;
}

export interface DailyPoint {
  /** unix seconds at UTC midnight */
  ts: number;
  price: number;
  /** quote-currency (USD) volume for the day */
  volume: number;
}

const num = (v: string | number | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const dayTs = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);

/**
 * Daily price/volume per mint for the whole window, keyed by mint.
 * One request covers every project, so this is called once per ingest.
 */
export async function fetchMarketHistory(
  startDate = "2024-01-01",
  endDate = new Date().toISOString().slice(0, 10)
): Promise<Map<string, DailyPoint[]>> {
  const data = await getJSON<{
    meteora?: { data?: MeteoraRow[] };
    futarchyAMM?: { data?: FutarchyRow[] };
  }>(`${MARKET_API}/api/market-data?startDate=${startDate}&endDate=${endDate}`, {
    headers: { "user-agent": BROWSER_UA },
    timeoutMs: 90000,
  });
  await sleep(1200);
  if (!data) return new Map();

  // price + volume from Meteora
  const byMint = new Map<string, Map<number, DailyPoint>>();
  for (const r of data.meteora?.data ?? []) {
    const price = num(r.average_price);
    if (!r.token || !r.date || price == null || price <= 0) continue;
    const ts = dayTs(r.date);
    if (!Number.isFinite(ts)) continue;
    const days = byMint.get(r.token) ?? new Map<number, DailyPoint>();
    days.set(ts, { ts, price, volume: num(r.target_volume) ?? 0 });
    byMint.set(r.token, days);
  }

  // add futarchy-AMM volume onto the same days (it carries no price)
  for (const r of data.futarchyAMM?.data ?? []) {
    if (!r.token || !r.date) continue;
    const days = byMint.get(r.token);
    if (!days) continue;
    const ts = dayTs(r.date);
    const point = days.get(ts);
    if (!point) continue;
    const extra = num(r.total_target_volume) ?? num(r.spot_target_volume) ?? 0;
    point.volume += extra;
  }

  const out = new Map<string, DailyPoint[]>();
  for (const [mint, days] of byMint) {
    out.set(mint, [...days.values()].sort((a, b) => a.ts - b.ts));
  }
  return out;
}
