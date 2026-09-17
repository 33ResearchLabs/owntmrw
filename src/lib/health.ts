import { db } from "./db";
import { healthScore, type HealthScore } from "./analytics";
import { periodReturns, type ScreenerRow } from "./queries";

/**
 * Health scores and period returns for every screener row at once.
 *
 * `healthScore` only reads a handful of fields — the live quote, the candle
 * closes, holder snapshots, the last GitHub push, the treasury balance and a
 * proposal count. `ScreenerRow` already carries the live and per-project
 * scalars, so the only history it lacks is the three series below, read here
 * in three statements for the whole table rather than ~16 per project through
 * `projectDetail`. The score itself is the same function the project page
 * calls, so the screener column and the header chip cannot disagree.
 */
export interface ScreenerExtras {
  health: HealthScore;
  /** Close-to-close returns against the live price, as on the chart footer. */
  d7: number | null;
  d30: number | null;
}

type CandleRow = { project_id: number; ts: number; c: number };
type HolderRow = {
  project_id: number;
  holder_count: number | null;
  top10_pct: number | null;
};

const DAY = 86400;

/**
 * Mirror of the carry-forward in `projectDetail`: the stored series stops at
 * the last ingest, so the live price is written onto today's bar (or appended
 * as one) before Momentum measures the last 30 days. Without this the screener
 * would score the trend to a stale close while the project page scores it to
 * the quote beside it. Only `c` matters to the score and the returns.
 */
function carryForward(
  candles: { ts: number; c: number }[],
  price: number | null,
  nowSec: number,
): void {
  if (price == null) return;
  const today = Math.floor(nowSec / DAY) * DAY;
  const last = candles[candles.length - 1];
  if (last && last.ts === today) {
    last.c = price;
  } else if (!last || last.ts < today) {
    candles.push({ ts: today, c: price });
  }
}

export function screenerExtras(
  rows: ScreenerRow[],
  nowSec: number,
): Map<string, ScreenerExtras> {
  const d = db();

  const candlesByProject = new Map<number, { ts: number; c: number }[]>();
  for (const r of d
    .prepare("SELECT project_id, ts, c FROM candles ORDER BY project_id, ts")
    .all() as CandleRow[]) {
    let list = candlesByProject.get(r.project_id);
    if (!list) candlesByProject.set(r.project_id, (list = []));
    list.push({ ts: r.ts, c: r.c });
  }

  const holdersByProject = new Map<
    number,
    { holder_count: number | null; top10_pct: number | null }[]
  >();
  for (const r of d
    .prepare(
      "SELECT project_id, holder_count, top10_pct FROM holder_snapshots ORDER BY project_id, ts",
    )
    .all() as HolderRow[]) {
    let list = holdersByProject.get(r.project_id);
    if (!list) holdersByProject.set(r.project_id, (list = []));
    list.push({ holder_count: r.holder_count, top10_pct: r.top10_pct });
  }

  const proposalsByProject = new Map<number, number>();
  for (const r of d
    .prepare("SELECT project_id, COUNT(*) AS n FROM proposals GROUP BY project_id")
    .all() as { project_id: number; n: number }[]) {
    proposalsByProject.set(r.project_id, r.n);
  }

  const out = new Map<string, ScreenerExtras>();
  for (const r of rows) {
    // Copied before the carry-forward so a second call in the same request
    // does not see today's bar twice.
    const candles = (candlesByProject.get(r.id) ?? []).map((c) => ({ ...c }));
    carryForward(candles, r.price_usd, nowSec);

    const health = healthScore({
      project: r,
      latest: r,
      candles,
      holderHistory: holdersByProject.get(r.id) ?? [],
      github: { last_push_ts: r.gh_last_push },
      treasuryValue: r.treasury_usd,
      proposals: { length: proposalsByProject.get(r.id) ?? 0 },
    });
    const returns = periodReturns(candles, r.price_usd, nowSec);
    out.set(r.slug, { health, d7: returns.d7, d30: returns.d30 });
  }
  return out;
}
