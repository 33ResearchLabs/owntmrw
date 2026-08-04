import { db, Project } from "./db";
import { applyQuote, liveQuotes } from "./live";

export interface ScreenerRow extends Project {
  price_usd: number | null; mcap: number | null; fdv: number | null;
  liquidity_usd: number | null; vol24h: number | null;
  change_24h: number | null;
  roi_since_raise: number | null;   // % vs raise price
  ath_return: number | null;        // % from raise price to ATH (peak return a raise buyer saw)
  from_ath: number | null;          // % current price vs ATH (drawdown)
  ath: number | null;
  treasury_usd: number | null;
  holder_count: number | null;
  holder_change_7d: number | null;
  gh_stars: number | null;
  gh_last_push: number | null;
  proposal_count: number;
}

/**
 * Price per token at the raise, or null when unknown. Never derived from a
 * guess — the ICO price comes from the raise registry.
 */
export function raisePrice(p: Pick<Project, "raise_price">): number | null {
  return p.raise_price && p.raise_price > 0 ? p.raise_price : null;
}

/**
 * Minimum pool depth for a quoted price to be treated as a real market price.
 * Below this, a handful of dollars moves the price arbitrarily, so returns
 * computed against it would be noise presented as fact.
 */
export const MIN_LIQUIDITY_USD = 10_000;

export function priceIsReliable(liquidityUsd: number | null | undefined): boolean {
  return liquidityUsd != null && liquidityUsd >= MIN_LIQUIDITY_USD;
}

/**
 * Rows straight from the archive. Prices here are as of the last ingest run,
 * so every caller goes through `screenerRows`, which overlays live quotes
 * before the return metrics are computed from them.
 */
function screenerSnapshot(): (ScreenerRow & { ath: number | null; holders_7d_ago: number | null })[] {
  const d = db();
  const rows = d.prepare(`
    SELECT p.*,
      ps.price_usd, ps.mcap, ps.fdv, ps.liquidity_usd, ps.vol24h, ps.change_24h,
      hs.holder_count,
      gh.stars AS gh_stars, gh.last_push_ts AS gh_last_push,
      (SELECT COUNT(*) FROM proposals pr WHERE pr.project_id = p.id) AS proposal_count,
      (SELECT MAX(c.h) FROM candles c WHERE c.project_id = p.id) AS ath,
      (SELECT ts2.value_usd FROM treasury_snapshots ts2
        WHERE ts2.project_id = p.id ORDER BY ts2.ts DESC LIMIT 1) AS treasury_usd,
      (SELECT hs2.holder_count FROM holder_snapshots hs2
        WHERE hs2.project_id = p.id AND hs2.ts <= unixepoch() - 7*86400
        ORDER BY hs2.ts DESC LIMIT 1) AS holders_7d_ago
    FROM projects p
    LEFT JOIN price_snapshots ps ON ps.project_id = p.id
      AND ps.ts = (SELECT MAX(ts) FROM price_snapshots WHERE project_id = p.id)
    LEFT JOIN holder_snapshots hs ON hs.project_id = p.id
      AND hs.ts = (SELECT MAX(ts) FROM holder_snapshots WHERE project_id = p.id)
    LEFT JOIN github_snapshots gh ON gh.project_id = p.id
      AND gh.ts = (SELECT MAX(ts) FROM github_snapshots WHERE project_id = p.id)
    ORDER BY ps.mcap DESC NULLS LAST, p.name
  `).all() as (ScreenerRow & { ath: number | null; holders_7d_ago: number | null })[];
  return rows;
}

/** Derived return metrics, computed from whichever price the row now carries. */
function withReturns(
  r: ScreenerRow & { ath: number | null; holders_7d_ago: number | null }
): ScreenerRow {
  const rp = raisePrice(r);
  // Returns are only meaningful against a price the market can actually
  // support; a few thousand dollars of liquidity is not a real quote.
  const tradable = priceIsReliable(r.liquidity_usd);
  const roi = rp && r.price_usd && tradable ? ((r.price_usd - rp) / rp) * 100 : null;
  const athRet = rp && r.ath && tradable ? ((r.ath - rp) / rp) * 100 : null;
  const fromAth = r.ath && r.price_usd && tradable ? ((r.price_usd - r.ath) / r.ath) * 100 : null;
  const hchg = r.holder_count != null && r.holders_7d_ago
    ? ((r.holder_count - r.holders_7d_ago) / r.holders_7d_ago) * 100 : null;
  return { ...r, roi_since_raise: roi, ath_return: athRet, from_ath: fromAth, holder_change_7d: hchg };
}

export async function screenerRows(): Promise<ScreenerRow[]> {
  const quotes = await liveQuotes();
  return screenerSnapshot().map((r) => {
    const live = applyQuote(r, r.mint ? quotes.get(r.mint) : undefined);
    // ATH is a running peak, so a live price above the last stored candle is
    // the new high — otherwise a token at a fresh high reads as "-0.0% from ATH"
    // only after the next ingest.
    const ath = live.price_usd != null && (live.ath == null || live.price_usd > live.ath)
      ? live.price_usd : live.ath;
    return withReturns({ ...live, ath });
  });
}

export interface ProjectDetail {
  project: Project;
  latest: { price_usd: number | null; mcap: number | null; fdv: number | null; liquidity_usd: number | null; vol24h: number | null; change_24h: number | null } | null;
  candles: { ts: number; o: number; h: number; l: number; c: number; v: number }[];
  events: { ts: number; type: string; title: string; detail: string | null; url: string | null }[];
  topHolders: { rank: number; address: string; owner: string | null; amount: number; pct: number; label: string | null }[];
  holderHistory: { ts: number; holder_count: number | null; top10_pct: number | null }[];
  proposals: { number: number | null; title: string | null; state: string | null; created_ts: number | null; url: string | null; author: string | null }[];
  github: { ts: number; stars: number | null; forks: number | null; repos: number | null; last_push_ts: number | null } | null;
  observations: { ts: number; kind: string | null; text: string }[];
  treasuryValue: number | null;
  treasuryHistory: { ts: number; value_usd: number | null }[];
  news: { ts: number; title: string; url: string | null; source: string | null }[];
  ath: number | null; atl: number | null;
  athTs: number | null;
}

export async function projectDetail(slug: string): Promise<ProjectDetail | null> {
  const d = db();
  const project = d.prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as Project | undefined;
  if (!project) return null;
  const id = project.id;
  const stored = d.prepare(
    "SELECT price_usd, mcap, fdv, liquidity_usd, vol24h, change_24h FROM price_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1"
  ).get(id) as ProjectDetail["latest"];
  // Everything below is archival and reads from the store; the quote is not.
  const quote = project.mint ? (await liveQuotes()).get(project.mint) : undefined;
  const latest = stored
    ? applyQuote(stored, quote)
    : quote
      ? {
          price_usd: quote.price_usd, mcap: quote.mcap, fdv: quote.fdv,
          liquidity_usd: quote.liquidity_usd, vol24h: quote.vol24h, change_24h: quote.change_24h,
        }
      : null;
  const candles = d.prepare("SELECT ts,o,h,l,c,v FROM candles WHERE project_id = ? ORDER BY ts").all(id) as ProjectDetail["candles"];
  const events = d.prepare("SELECT ts,type,title,detail,url FROM events WHERE project_id = ? ORDER BY ts DESC LIMIT 100").all(id) as ProjectDetail["events"];
  const topHolders = d.prepare("SELECT rank,address,owner,amount,pct,label FROM top_holders WHERE project_id = ? ORDER BY rank LIMIT 20").all(id) as ProjectDetail["topHolders"];
  const holderHistory = d.prepare("SELECT ts,holder_count,top10_pct FROM holder_snapshots WHERE project_id = ? ORDER BY ts").all(id) as ProjectDetail["holderHistory"];
  const proposals = d.prepare("SELECT number,title,state,created_ts,url,author FROM proposals WHERE project_id = ? ORDER BY created_ts DESC").all(id) as ProjectDetail["proposals"];
  const github = d.prepare("SELECT ts,stars,forks,repos,last_push_ts FROM github_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1").get(id) as ProjectDetail["github"];
  const observations = d.prepare("SELECT ts,kind,text FROM observations WHERE project_id = ? ORDER BY ts DESC LIMIT 30").all(id) as ProjectDetail["observations"];
  const treasury = d.prepare("SELECT value_usd FROM treasury_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1").get(id) as { value_usd: number | null } | undefined;
  const treasuryHistory = d.prepare(
    "SELECT ts, value_usd FROM treasury_snapshots WHERE project_id = ? ORDER BY ts"
  ).all(id) as ProjectDetail["treasuryHistory"];
  // News is drawn from the event log: releases and announcements carry a URL.
  const news = d.prepare(`
    SELECT ts, title, url, type AS source FROM events
    WHERE project_id = ? AND type IN ('github_release','news','announcement','blog')
    ORDER BY ts DESC LIMIT 50
  `).all(id) as ProjectDetail["news"];

  let ath: number | null = null, atl: number | null = null, athTs: number | null = null;
  for (const c of candles) {
    if (ath == null || c.h > ath) { ath = c.h; athTs = c.ts; }
    if (atl == null || c.l < atl) atl = c.l;
  }
  // Candles are daily, so a live price above the stored peak is the new high.
  // Without this a token at a fresh high reports a positive drawdown.
  if (latest?.price_usd != null && (ath == null || latest.price_usd > ath)) {
    ath = latest.price_usd;
    athTs = Math.floor(Date.now() / 1000);
  }
  return {
    project, latest, candles, events, topHolders, holderHistory, proposals, github, observations,
    treasuryValue: treasury?.value_usd ?? null, treasuryHistory, news, ath, atl, athTs,
  };
}

/**
 * How many distinct projects list each wallet as a top holder. Feeds the
 * organisation classifier — a wallet in many raises is likely a desk or fund.
 */
export function crossProjectHolderCounts(): Map<string, number> {
  const rows = db().prepare(`
    SELECT COALESCE(owner, address) AS w, COUNT(DISTINCT project_id) AS n
    FROM top_holders GROUP BY w
  `).all() as { w: string; n: number }[];
  return new Map(rows.map((r) => [r.w, r.n]));
}

export function searchAll(q: string) {
  const d = db();
  const like = `%${q}%`;
  const projects = d.prepare(
    "SELECT slug, name, symbol, mint FROM projects WHERE name LIKE ? OR symbol LIKE ? OR mint LIKE ? OR slug LIKE ? LIMIT 6"
  ).all(like, like, like, like) as { slug: string; name: string; symbol: string | null; mint: string | null }[];
  const proposals = d.prepare(`
    SELECT pr.title, pr.url, p.slug, p.name FROM proposals pr JOIN projects p ON p.id = pr.project_id
    WHERE pr.title LIKE ? LIMIT 4
  `).all(like) as { title: string | null; url: string | null; slug: string; name: string }[];
  const holders = d.prepare(`
    SELECT th.address, th.owner, th.label, p.slug, p.name FROM top_holders th JOIN projects p ON p.id = th.project_id
    WHERE th.address LIKE ? OR th.owner LIKE ? LIMIT 4
  `).all(like, like) as { address: string; owner: string | null; label: string | null; slug: string; name: string }[];

  return [
    ...projects.map((p) => ({ type: "project", label: `${p.name}${p.symbol ? ` (${p.symbol})` : ""}`, sub: p.mint ? p.mint.slice(0, 8) + "…" : "", href: `/project/${p.slug}` })),
    ...proposals.map((pr) => ({ type: "proposal", label: pr.title ?? "Proposal", sub: pr.name, href: `/project/${pr.slug}#governance` })),
    ...holders.map((h) => ({ type: "wallet", label: h.owner ?? h.address, sub: `${h.label ?? "holder"} · ${h.name}`, href: `/project/${h.slug}#holders` })),
  ];
}

export function globalTimeline(limit = 120) {
  return db().prepare(`
    SELECT e.ts, e.type, e.title, e.detail, e.url, p.slug, p.name, p.symbol
    FROM events e JOIN projects p ON p.id = e.project_id
    ORDER BY e.ts DESC LIMIT ?
  `).all(limit) as { ts: number; type: string; title: string; detail: string | null; url: string | null; slug: string; name: string; symbol: string | null }[];
}

export function allObservations(limit = 100) {
  return db().prepare(`
    SELECT o.ts, o.kind, o.text, p.slug, p.name FROM observations o
    LEFT JOIN projects p ON p.id = o.project_id
    ORDER BY o.ts DESC LIMIT ?
  `).all(limit) as { ts: number; kind: string | null; text: string; slug: string | null; name: string | null }[];
}
