import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { intradayOHLCV } from "@/lib/sources/geckoterminal";
import { INTRADAY, fold, normalize, type Candle, type Timeframe } from "@/lib/candles";

/**
 * Sub-daily candles for one project.
 *
 * Only intraday timeframes come through here: the archive stores daily bars, so
 * 1D/1W/1M are folded from the data the page already shipped and never cost a
 * request. Intraday has no store at all — it is fetched from the pool's OHLCV
 * feed and cached briefly, because the upstream is rate-limited (~30 req/min)
 * and every open chart would otherwise hit it on each timeframe click.
 */
export const dynamic = "force-dynamic";

/** A bar can only change until it closes, so cache for a fraction of its length. */
const TTL_MS: Record<string, number> = {
  "minute:1": 30_000, "minute:5": 60_000, "minute:15": 120_000,
  "hour:1": 300_000, "hour:4": 600_000,
};

interface Entry { at: number; candles: Candle[] }
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Candle[] | null>>();

/**
 * Fetch one upstream series, keyed by the request it makes rather than by the
 * timeframe that asked. 30m is folded from the same 15m call that serves 15m,
 * so keying by timeframe billed the rate limit twice for one series — and that
 * limit is exactly what makes a timeframe come back empty.
 */
async function loadRaw(pool: string, unit: "minute" | "hour", aggregate: number): Promise<Candle[] | null> {
  const key = `${pool}:${unit}:${aggregate}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (TTL_MS[`${unit}:${aggregate}`] ?? 60_000)) return hit.candles;

  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    const got = await intradayOHLCV(pool, unit, aggregate);
    if (!got) return null;
    // The feed repeats timestamps often enough to matter — clean before folding
    // so the cache never stores a series the chart would reject.
    const candles = normalize(got);
    if (candles.length) cache.set(key, { at: Date.now(), candles });
    return candles;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

async function load(pool: string, tf: Timeframe): Promise<Candle[] | null> {
  const spec = INTRADAY[tf];
  const raw = await loadRaw(pool, spec.unit, spec.aggregate);
  if (!raw) return null;
  // 30m has no upstream aggregate — pair up the 15m bars instead.
  return spec.foldTo
    ? fold(raw, (ts) => Math.floor(ts / spec.foldTo!) * spec.foldTo!)
    : raw;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim() ?? "";
  const tf = (req.nextUrl.searchParams.get("tf")?.trim() ?? "") as Timeframe;

  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  if (!INTRADAY[tf]) {
    return NextResponse.json(
      { error: `${tf || "timeframe"} is not an intraday timeframe` },
      { status: 400 }
    );
  }

  const row = db()
    .prepare("SELECT pool_address FROM projects WHERE slug = ?")
    .get(slug) as { pool_address: string | null } | undefined;

  if (!row) return NextResponse.json({ error: "unknown project" }, { status: 404 });
  if (!row.pool_address) {
    return NextResponse.json(
      { error: "No liquidity pool is indexed for this project, so intraday candles cannot be built." },
      { status: 404 }
    );
  }

  const candles = await load(row.pool_address, tf);
  if (!candles) {
    return NextResponse.json(
      { error: "The candle feed did not respond — it throttles bursts. Try again in a moment." },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }

  return NextResponse.json(
    { tf, source: "geckoterminal", candles },
    { headers: { "cache-control": "no-store" } }
  );
}
