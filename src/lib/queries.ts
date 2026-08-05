import { db, Project, sameBalance } from "./db";
import { applyQuote, liveQuotes } from "./live";
import { ICO_TOKENS_SOLD } from "./sources/raises";

export interface ScreenerRow extends Project {
  price_usd: number | null; mcap: number | null; fdv: number | null;
  liquidity_usd: number | null; vol24h: number | null;
  change_24h: number | null;
  /** Reconstructed from the raise rather than recorded — surface it as such. */
  raise_price_derived: boolean;
  roi_since_raise: number | null;   // % vs raise price
  ath_return: number | null;        // % from raise price to ATH (peak return a raise buyer saw)
  from_ath: number | null;          // % current price vs ATH (drawdown)
  ath: number | null;
  treasury_usd: number | null;
  holder_count: number | null;
  gh_stars: number | null;
  gh_last_push: number | null;
}

/**
 * Price per token at the raise, or null when unknown. Never derived from a
 * guess — the ICO price comes from the raise registry.
 */
export interface RaisePrice {
  usd: number;
  /** True when computed from the raise rather than read from the registry. */
  derived: boolean;
}

/**
 * Only these tracks are launchpad sales. MetaDAO's own token was a private
 * round led by Paradigm, and it carries no track for exactly that reason —
 * dividing its $2.2M by a token count it never sold would invent a price.
 */
const LAUNCHPAD_TRACKS = new Set(["curated", "permissionless"]);

/**
 * The per-token price paid at the raise, recorded or reconstructed.
 *
 * docs.metadao.fi/how-launches-work/sale specifies that every launchpad ICO
 * sells exactly ICO_TOKENS_SOLD tokens at a uniform price, so the price is
 * fully determined by the accepted amount. Checked against every project that
 * records both: 13 of 13 match to the cent, across both tracks, with no
 * exceptions — which is why the fallback is safe to apply and why it is still
 * flagged as derived wherever it is shown.
 */
export function raisePriceOf(
  p: Pick<Project, "raise_price" | "raise_amount_usd" | "raise_track">
): RaisePrice | null {
  if (p.raise_price && p.raise_price > 0) return { usd: p.raise_price, derived: false };
  if (!p.raise_track || !LAUNCHPAD_TRACKS.has(p.raise_track)) return null;
  if (!p.raise_amount_usd || p.raise_amount_usd <= 0) return null;
  return { usd: p.raise_amount_usd / ICO_TOKENS_SOLD, derived: true };
}

export function raisePrice(
  p: Pick<Project, "raise_price" | "raise_amount_usd" | "raise_track">
): number | null {
  return raisePriceOf(p)?.usd ?? null;
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
function screenerSnapshot(): (ScreenerRow & { ath: number | null })[] {
  const d = db();
  const rows = d.prepare(`
    SELECT p.*,
      ps.price_usd, ps.mcap, ps.fdv, ps.liquidity_usd, ps.vol24h, ps.change_24h,
      hs.holder_count,
      gh.stars AS gh_stars, gh.last_push_ts AS gh_last_push,
      (SELECT MAX(c.h) FROM candles c WHERE c.project_id = p.id) AS ath,
      (SELECT ts2.value_usd FROM treasury_snapshots ts2
        WHERE ts2.project_id = p.id ORDER BY ts2.ts DESC LIMIT 1) AS treasury_usd
    FROM projects p
    LEFT JOIN price_snapshots ps ON ps.project_id = p.id
      AND ps.ts = (SELECT MAX(ts) FROM price_snapshots WHERE project_id = p.id)
    LEFT JOIN holder_snapshots hs ON hs.project_id = p.id
      AND hs.ts = (SELECT MAX(ts) FROM holder_snapshots WHERE project_id = p.id)
    LEFT JOIN github_snapshots gh ON gh.project_id = p.id
      AND gh.ts = (SELECT MAX(ts) FROM github_snapshots WHERE project_id = p.id)
    ORDER BY ps.mcap DESC NULLS LAST, p.name
  `).all() as (ScreenerRow & { ath: number | null })[];
  return rows;
}

/** Derived return metrics, computed from whichever price the row now carries. */
function withReturns(r: ScreenerRow & { ath: number | null }): ScreenerRow {
  const resolved = raisePriceOf(r);
  const rp = resolved?.usd ?? null;
  // Returns are only meaningful against a price the market can actually
  // support; a few thousand dollars of liquidity is not a real quote.
  const tradable = priceIsReliable(r.liquidity_usd);
  const roi = rp && r.price_usd && tradable ? ((r.price_usd - rp) / rp) * 100 : null;
  const athRet = rp && r.ath && tradable ? ((r.ath - rp) / rp) * 100 : null;
  const fromAth = r.ath && r.price_usd && tradable ? ((r.price_usd - r.ath) / r.ath) * 100 : null;
  // raise_price on the row is the resolved figure, so every screener consumer
  // sees the same number the returns were computed from; the flag beside it
  // says whether it was recorded or reconstructed.
  return {
    ...r,
    raise_price: rp,
    raise_price_derived: resolved?.derived ?? false,
    roi_since_raise: roi, ath_return: athRet, from_ath: fromAth,
  };
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

/** One reading of a project's public engineering output. */
export interface GithubSnapshot {
  ts: number;
  stars: number | null; forks: number | null; repos: number | null;
  last_push_ts: number | null; last_commit_ts: number | null;
  contributors: number | null; commits_90d: number | null;
  open_issues: number | null; closed_issues: number | null;
  open_prs: number | null; merged_prs: number | null;
  releases_count: number | null; active_repos: number | null;
  /** JSON as stored; use parseLanguages / parseCodeFrequency to read them. */
  languages: string | null;
  code_frequency: string | null;
}

export interface RiskFlag { name: string; description: string; level: string; score: number }

export interface RiskSnapshot {
  ts: number;
  score: number | null;
  /** 0-100, higher is safer — the opposite direction to the raw score. */
  score_normalised: number | null;
  rugged: number | null;
  mint_authority: number | null;
  freeze_authority: number | null;
  lp_locked_pct: number | null;
  total_holders: number | null;
  total_lp_providers: number | null;
  risks: string | null;
}

export const parseRisks = (r: RiskSnapshot | null) => parseJson<RiskFlag>(r?.risks ?? null);

export interface ExchangeListing {
  exchange: string; pair: string;
  volume_usd: number | null; trust: string | null;
  url: string | null; is_dex: number | null; ts: number | null;
}

export interface Language { name: string; bytes: number }
export interface CodeWeek { week: number; additions: number; deletions: number }

/** Stored JSON is never trusted blindly — a malformed blob must not 500 a page. */
function parseJson<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export const parseLanguages = (g: GithubSnapshot | null) => parseJson<Language>(g?.languages ?? null);
export const parseCodeFrequency = (g: GithubSnapshot | null) => parseJson<CodeWeek>(g?.code_frequency ?? null);

export interface ProjectDetail {
  project: Project;
  latest: { price_usd: number | null; mcap: number | null; fdv: number | null; liquidity_usd: number | null; vol24h: number | null; change_24h: number | null } | null;
  candles: { ts: number; o: number; h: number; l: number; c: number; v: number }[];
  events: { ts: number; type: string; title: string; detail: string | null; url: string | null }[];
  topHolders: { rank: number; address: string; owner: string | null; amount: number; pct: number; label: string | null }[];
  holderHistory: { ts: number; holder_count: number | null; top10_pct: number | null }[];
  proposals: { number: number | null; title: string | null; state: string | null; created_ts: number | null; url: string | null; author: string | null }[];
  github: GithubSnapshot | null;
  observations: { ts: number; kind: string | null; text: string }[];
  treasuryValue: number | null;
  /**
   * A step series, not a read log: one entry per balance change, where `ts` is
   * when the balance first read that way and `last_seen_ts` when we last
   * confirmed it. Coverage is `treasuryLastRead`, not the entry count — a
   * well-tracked vault that never moves is a single long-lived entry.
   */
  treasuryHistory: { ts: number; value_usd: number | null; last_seen_ts: number }[];
  /** When the vault was last read at all, regardless of whether it moved. */
  treasuryLastRead: number | null;
  /** `source` is the publisher (CoinDesk…); `type` is the event class. */
  news: { ts: number; title: string; url: string | null; source: string | null; type: string }[];
  /** Git tags from the project's repos — engineering output, not press. */
  releases: { ts: number; title: string; url: string | null; source: string | null }[];
  listings: ExchangeListing[];
  risk: RiskSnapshot | null;
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
  const github = d.prepare(`
    SELECT ts, stars, forks, repos, last_push_ts, last_commit_ts, contributors, commits_90d,
           open_issues, closed_issues, open_prs, merged_prs, releases_count, active_repos,
           languages, code_frequency
    FROM github_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1
  `).get(id) as ProjectDetail["github"];
  const observations = d.prepare("SELECT ts,kind,text FROM observations WHERE project_id = ? ORDER BY ts DESC LIMIT 30").all(id) as ProjectDetail["observations"];
  const treasury = d.prepare("SELECT value_usd FROM treasury_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1").get(id) as { value_usd: number | null } | undefined;
  // recordTreasurySnapshot keeps this one-row-per-change going forward, but
  // rows written before that ran are one-per-read: a balance that sat still
  // for a day rendered as a dozen identical dates at 0.0%, which reads like a
  // data bug. Collapse runs of equal balances onto the read that first saw the
  // value, carrying last_seen_ts forward, so the date answers "when did the
  // treasury move" — the question the column is there to answer.
  const treasuryReads = d.prepare(
    "SELECT ts, value_usd, COALESCE(last_seen_ts, ts) AS last_seen_ts FROM treasury_snapshots WHERE project_id = ? ORDER BY ts"
  ).all(id) as ProjectDetail["treasuryHistory"];
  const treasuryHistory: ProjectDetail["treasuryHistory"] = [];
  for (const read of treasuryReads) {
    const open = treasuryHistory[treasuryHistory.length - 1];
    if (open && sameBalance(open.value_usd, read.value_usd)) {
      open.last_seen_ts = Math.max(open.last_seen_ts, read.last_seen_ts);
    } else {
      treasuryHistory.push({ ...read });
    }
  }
  const treasuryLastRead = treasuryHistory.length
    ? treasuryHistory[treasuryHistory.length - 1].last_seen_ts
    : null;
  // News and releases are kept apart. Folding git tags into "news" made the
  // News tab read "17" on a project with no press coverage at all, and half of
  // those tags were from a test repo — an availability claim we cannot support.
  // detail carries the publisher for wire items; fall back to the type so an
  // older row written before the wire existed still labels itself.
  const news = d.prepare(`
    SELECT ts, title, url, type, COALESCE(detail, type) AS source FROM events
    WHERE project_id = ? AND type IN ('news','announcement','blog')
    ORDER BY ts DESC LIMIT 50
  `).all(id) as ProjectDetail["news"];
  const releases = d.prepare(`
    SELECT ts, title, url, type AS source FROM events
    WHERE project_id = ? AND type = 'github_release'
    ORDER BY ts DESC LIMIT 50
  `).all(id) as ProjectDetail["releases"];
  const listings = d.prepare(`
    SELECT exchange, pair, volume_usd, trust, url, is_dex, ts FROM exchange_listings
    WHERE project_id = ? ORDER BY volume_usd DESC NULLS LAST
  `).all(id) as ProjectDetail["listings"];
  const risk = d.prepare(`
    SELECT ts, score, score_normalised, rugged, mint_authority, freeze_authority,
           lp_locked_pct, total_holders, total_lp_providers, risks
    FROM risk_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1
  `).get(id) as ProjectDetail["risk"];

  // Candles are written by ingest, so on a deployment that re-ingests
  // occasionally the series stops days short of today and the chart contradicts
  // the price above it — $5.26 on the last candle against a $6.81 headline.
  // Carrying the quote onto the current day reconciles the two. The gap between
  // the last stored candle and today stays visible rather than being filled in:
  // we know the price now, not the path it took.
  if (latest?.price_usd != null) {
    const DAY = 86400;
    const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
    const last = candles[candles.length - 1];
    if (last && last.ts === today) {
      last.c = latest.price_usd;
      last.h = Math.max(last.h, latest.price_usd);
      last.l = Math.min(last.l, latest.price_usd);
    } else if (!last || last.ts < today) {
      const open = last ? last.c : latest.price_usd;
      candles.push({
        ts: today,
        o: open,
        h: Math.max(open, latest.price_usd),
        l: Math.min(open, latest.price_usd),
        c: latest.price_usd,
        v: 0,
      });
    }
  }

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
    treasuryValue: treasury?.value_usd ?? null, treasuryHistory, treasuryLastRead,
    news, releases, listings, risk,
    ath, atl, athTs,
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
