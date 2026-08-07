import { db } from "./db";

/**
 * Site-wide roll-ups for the home page: what every tracked project adds up to,
 * day by day.
 *
 * These are sums across projects, which is exactly where a naive query goes
 * wrong — see `stockDaily` on why a missing reading is not a zero.
 */

const DAY = 86400;

/** The UTC day a timestamp falls in. Candles already land on this grid. */
const dayOf = (ts: number) => Math.floor(ts / DAY) * DAY;

/** A combined daily reading, and how many projects went into it. */
interface Point { ts: number; v: number; n: number }

export interface AggSeries {
  /** Latest combined reading, or null when nothing reports. */
  now: number | null;
  /** Daily points, oldest first, for the sparkline. */
  series: number[];
  /** Percent change against the start of the window, or null if unmeasurable. */
  changePct: number | null;
  /** Distinct days behind the series — thin history is worth admitting. */
  days: number;
  /** Projects contributing to the latest point. */
  contributors: number;
  /** Days `changePct` actually spans — the run where coverage held steady. */
  changeDays: number;
}

const EMPTY: AggSeries = { now: null, series: [], changePct: 0, days: 0, contributors: 0, changeDays: 0 };

function finish(points: Point[], window: number): AggSeries {
  const kept = points.slice(-window);
  if (!kept.length) return { ...EMPTY, changePct: null };
  const series = kept.map((p) => p.v);
  const b = kept[kept.length - 1];

  // Measure the change only back to where our coverage last changed.
  //
  // A combined total that grows because more projects started reporting has
  // not grown at all: over the full window the GitHub series runs from one
  // project's snapshot to fifteen and reads "+2372%", which is a statement
  // about our coverage dressed up as a statement about theirs. So walk back
  // while the contributing-project count holds, and measure over that run —
  // a shorter, true comparison rather than a long, false one.
  let i = kept.length - 1;
  while (i > 0 && kept[i - 1].n === b.n) i--;
  const a = kept[i];

  return {
    now: b.v,
    series,
    // Still null with nothing to compare against, or a base of zero — rising
    // from nothing is not a percentage.
    changePct: i < kept.length - 1 && a.v > 0 ? ((b.v - a.v) / a.v) * 100 : null,
    days: kept.length,
    contributors: b.n,
    changeDays: kept.length - 1 - i,
  };
}

/**
 * A **stock** summed across projects — treasury, holders, liquidity, market
 * cap. Each project's last reading is carried forward.
 *
 * `GROUP BY ts, SUM(v)` would be one line and wrong. Projects do not all report
 * on the same day: 22 projects but only 15–18 candles on a given date, and
 * treasury readings on three days total. Summing only what reported that day
 * makes the combined total collapse and recover as projects drop in and out,
 * which reads as the whole market losing a fortune overnight. Carrying forward
 * means the total moves only when a project actually reports a new number.
 *
 * The trade-off is that a project which stops reporting keeps contributing its
 * last known value. Over a window of a few months that is the honest reading of
 * "what we last knew"; it would not be over a multi-year one.
 */
function stockDaily(rows: { pid: number; ts: number; v: number }[]): Point[] {
  const byDay = new Map<number, Map<number, number>>();
  for (const r of rows) {
    const d = dayOf(r.ts);
    if (!byDay.has(d)) byDay.set(d, new Map());
    // Later reading on the same day wins.
    byDay.get(d)!.set(r.pid, r.v);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const last = new Map<number, number>();
  return days.map((d) => {
    for (const [pid, v] of byDay.get(d)!) last.set(pid, v);
    let total = 0;
    for (const v of last.values()) total += v;
    return { ts: d, v: total, n: last.size };
  });
}

/**
 * A **flow** summed across projects — traded volume. Never carried forward: a
 * day a project reported nothing traded nothing that we know of, and repeating
 * yesterday's volume would invent trades.
 */
function flowDaily(rows: { pid: number; ts: number; v: number }[]): Point[] {
  const byDay = new Map<number, { v: number; pids: Set<number> }>();
  for (const r of rows) {
    const d = dayOf(r.ts);
    if (!byDay.has(d)) byDay.set(d, { v: 0, pids: new Set() });
    const slot = byDay.get(d)!;
    slot.v += r.v;
    slot.pids.add(r.pid);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, s]) => ({ ts, v: s.v, n: s.pids.size }));
}

export interface HomeAggregates {
  /** Combined market capitalisation, priced off daily closes. */
  mcap: AggSeries;
  /** Combined traded volume per day. */
  volume: AggSeries;
  /** Combined on-chain treasury value. */
  treasury: AggSeries;
  /** Combined holder count. */
  holders: AggSeries;
  /** Combined pool depth. */
  liquidity: AggSeries;
  /** Total capital raised across every project with a recorded raise. */
  raised: number;
  /** Projects with a treasury reading on file. */
  treasuryProjects: number;
  /** Combined treasury as a share of all capital raised, day by day. */
  retained: AggSeries;
  /** How many projects reported a treasury balance, day by day. */
  fundedProjects: AggSeries;
  /** Combined GitHub figures, from each project's latest snapshot. */
  dev: {
    commits90d: number | null;
    mergedPrs: number | null;
    contributors: number | null;
    stars: number | null;
    repos: number | null;
    projects: number;
  };
  /** The same four figures as daily combined series, for their sparklines. */
  devSeries: {
    commits90d: AggSeries; mergedPrs: AggSeries;
    contributors: AggSeries; repos: AggSeries;
  };
  /** Newest commits across every tracked project. */
  commits: { ts: number; message: string; author: string | null; url: string | null; slug: string; name: string; image_url: string | null }[];
}

/** Days of history each sparkline covers. */
const WINDOW = 120;

export function homeAggregates(): HomeAggregates {
  const d = db();

  const mcapRows = d.prepare(`
    SELECT c.project_id AS pid, c.ts AS ts, c.c * p.circulating_supply AS v
    FROM candles c JOIN projects p ON p.id = c.project_id
    WHERE p.circulating_supply IS NOT NULL AND c.c IS NOT NULL
  `).all() as { pid: number; ts: number; v: number }[];

  const volRows = d.prepare(
    "SELECT project_id AS pid, ts, v FROM candles WHERE v > 0"
  ).all() as { pid: number; ts: number; v: number }[];

  const treRows = d.prepare(
    "SELECT project_id AS pid, ts, value_usd AS v FROM treasury_snapshots WHERE value_usd IS NOT NULL"
  ).all() as { pid: number; ts: number; v: number }[];

  const holRows = d.prepare(
    "SELECT project_id AS pid, ts, holder_count AS v FROM holder_snapshots WHERE holder_count IS NOT NULL"
  ).all() as { pid: number; ts: number; v: number }[];

  const liqRows = d.prepare(
    "SELECT project_id AS pid, ts, liquidity_usd AS v FROM price_snapshots WHERE liquidity_usd IS NOT NULL"
  ).all() as { pid: number; ts: number; v: number }[];

  const raised = (d.prepare(
    "SELECT COALESCE(SUM(raise_amount_usd), 0) AS n FROM projects"
  ).get() as { n: number }).n;

  const treasuryProjects = (d.prepare(
    "SELECT COUNT(DISTINCT project_id) AS n FROM treasury_snapshots WHERE value_usd IS NOT NULL"
  ).get() as { n: number }).n;

  // One row per project — its most recent GitHub read — then summed. Summing
  // the whole table would count every historical snapshot of every repo.
  const dev = d.prepare(`
    SELECT
      SUM(g.commits_90d) AS commits90d, SUM(g.merged_prs) AS mergedPrs,
      SUM(g.contributors) AS contributors, SUM(g.stars) AS stars,
      SUM(g.repos) AS repos, COUNT(*) AS projects
    FROM github_snapshots g
    WHERE g.ts = (SELECT MAX(ts) FROM github_snapshots WHERE project_id = g.project_id)
  `).get() as HomeAggregates["dev"];

  // Each GitHub field is its own stock series: a project whose ingest run was
  // rate-limited carries null for that field on that row, so a shared filter
  // would drop whole days from every field because one field was missing.
  const ghSeries = (field: string) =>
    finish(stockDaily(d.prepare(
      `SELECT project_id AS pid, ts, ${field} AS v FROM github_snapshots WHERE ${field} IS NOT NULL`
    ).all() as { pid: number; ts: number; v: number }[]), WINDOW);

  const commits = d.prepare(`
    SELECT e.ts, e.title AS message, e.detail AS author, e.url,
           p.slug, p.name, p.image_url
    FROM events e JOIN projects p ON p.id = e.project_id
    WHERE e.type = 'github_commit'
    ORDER BY e.ts DESC LIMIT 6
  `).all() as HomeAggregates["commits"];

  const treasuryPoints = stockDaily(treRows);

  return {
    // raised is a constant, so dividing the treasury series by it rescales the
    // same shape — the retention line is the treasury line, in percent.
    retained: finish(
      raised > 0 ? treasuryPoints.map((p) => ({ ...p, v: (p.v / raised) * 100 })) : [],
      WINDOW
    ),
    fundedProjects: finish(treasuryPoints.map((p) => ({ ...p, v: p.n })), WINDOW),
    mcap: finish(stockDaily(mcapRows), WINDOW),
    volume: finish(flowDaily(volRows), WINDOW),
    treasury: finish(treasuryPoints, WINDOW),
    holders: finish(stockDaily(holRows), WINDOW),
    liquidity: finish(stockDaily(liqRows), WINDOW),
    raised,
    treasuryProjects,
    dev,
    devSeries: {
      commits90d: ghSeries("commits_90d"),
      mergedPrs: ghSeries("merged_prs"),
      contributors: ghSeries("contributors"),
      repos: ghSeries("repos"),
    },
    commits,
  };
}
