import type { ProjectDetail } from "./queries";
import { parseRisks } from "./queries";
import { timeAgo } from "./format";

/**
 * Every metric here is derived from data we actually hold. Where an input is
 * missing, the component returns null and is excluded from the overall score
 * rather than being scored as zero — an unmeasured dimension is not a failing
 * one, and silently defaulting would make the headline number a lie.
 */

export interface ScoreComponent {
  key: string;
  label: string;
  score: number | null;
  detail: string;
}

export interface HealthScore {
  overall: number | null;
  components: ScoreComponent[];
  measured: number;
  total: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Map a value onto 0-100 by where it falls between a floor and a ceiling. */
function band(v: number, floor: number, ceil: number): number {
  if (ceil === floor) return 50;
  return clamp(((v - floor) / (ceil - floor)) * 100);
}

export function healthScore(d: ProjectDetail): HealthScore {
  const { project: p, latest, candles, holderHistory, github, treasuryValue, proposals } = d;
  const components: ScoreComponent[] = [];

  // --- Treasury: runway relative to what was raised, and absolute size.
  if (treasuryValue != null) {
    const vsRaise = p.raise_amount_usd ? treasuryValue / p.raise_amount_usd : null;
    const score = vsRaise != null
      ? band(vsRaise, 0, 1.2)
      : band(Math.log10(Math.max(treasuryValue, 1)), 3, 7); // $1k → $10M
    components.push({
      key: "treasury", label: "Treasury", score,
      detail: vsRaise != null
        ? `${(vsRaise * 100).toFixed(0)}% of the raise still held`
        : `${treasuryValue >= 1e6 ? `$${(treasuryValue / 1e6).toFixed(1)}M` : `$${Math.round(treasuryValue).toLocaleString()}`} on-chain`,
    });
  } else {
    components.push({ key: "treasury", label: "Treasury", score: null, detail: "no treasury vault indexed" });
  }

  // --- Holder growth: trend across snapshots.
  const hh = holderHistory.filter((h) => h.holder_count != null);
  if (hh.length >= 2) {
    const first = hh[0].holder_count!, lastH = hh[hh.length - 1].holder_count!;
    const pct = first > 0 ? ((lastH - first) / first) * 100 : 0;
    components.push({
      key: "holders", label: "Holder Growth", score: band(pct, -10, 25),
      detail: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% since tracking began`,
    });
  } else {
    const only = hh[0]?.holder_count;
    components.push({
      key: "holders", label: "Holder Growth", score: null,
      detail: only != null ? `${only.toLocaleString()} holders — needs more history` : "no holder data",
    });
  }

  // --- Concentration: lower top-10 share scores higher.
  const t10 = [...holderHistory].reverse().find((h) => h.top10_pct != null)?.top10_pct;
  if (t10 != null) {
    components.push({
      key: "concentration", label: "Distribution", score: band(100 - t10, 20, 75),
      detail: `top 10 hold ${t10.toFixed(1)}% of supply`,
    });
  } else {
    components.push({ key: "concentration", label: "Distribution", score: null, detail: "holder list unavailable" });
  }

  // --- Liquidity: depth relative to market cap.
  if (latest?.liquidity_usd != null && latest.mcap) {
    const ratio = latest.liquidity_usd / latest.mcap;
    components.push({
      key: "liquidity", label: "Liquidity", score: band(ratio * 100, 1, 25),
      detail: `${(ratio * 100).toFixed(1)}% of market cap is liquid`,
    });
  } else {
    components.push({ key: "liquidity", label: "Liquidity", score: null, detail: "no pool data" });
  }

  // --- Developer activity: recency of pushes.
  if (github?.last_push_ts) {
    const days = (Date.now() / 1000 - github.last_push_ts) / 86400;
    components.push({
      key: "dev", label: "Developer Activity", score: band(60 - days, 0, 60),
      detail: days < 1 ? "pushed today" : `last push ${Math.round(days)}d ago`,
    });
  } else {
    components.push({ key: "dev", label: "Developer Activity", score: null, detail: "no GitHub linked" });
  }

  // --- Governance: proposal throughput.
  if (proposals.length > 0) {
    components.push({
      key: "governance", label: "Governance", score: band(proposals.length, 0, 12),
      detail: `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} indexed`,
    });
  } else {
    components.push({ key: "governance", label: "Governance", score: null, detail: "no proposals indexed" });
  }

  // --- Momentum: 30d price trend blended with volume-to-liquidity.
  if (candles.length >= 8) {
    const win = candles.slice(-30);
    const chg = win[0].c > 0 ? ((candles[candles.length - 1].c - win[0].c) / win[0].c) * 100 : 0;
    const turn = latest?.vol24h && latest.liquidity_usd ? latest.vol24h / latest.liquidity_usd : null;
    const priceScore = band(chg, -50, 50);
    const score = turn != null ? Math.round(priceScore * 0.7 + band(turn, 0, 1.5) * 0.3) : priceScore;
    components.push({
      key: "momentum", label: "Momentum", score,
      detail: `${chg >= 0 ? "+" : ""}${chg.toFixed(0)}% over ${win.length}d`,
    });
  } else {
    components.push({ key: "momentum", label: "Momentum", score: null, detail: "insufficient price history" });
  }

  const measured = components.filter((c) => c.score != null);
  const overall = measured.length
    ? Math.round(measured.reduce((s, c) => s + c.score!, 0) / measured.length)
    : null;

  return { overall, components, measured: measured.length, total: components.length };
}

export function scoreColor(score: number | null): string {
  if (score == null) return "var(--ink-muted)";
  if (score >= 75) return "var(--good)";
  if (score >= 50) return "var(--warn)";
  if (score >= 30) return "var(--serious)";
  return "var(--bad)";
}

// ---------------------------------------------------------------- insights

export interface Insight { text: string; kind: string; tone: "good" | "bad" | "neutral" }

/** Observations generated from measured changes only — never speculation. */
export function insights(d: ProjectDetail): Insight[] {
  const out: Insight[] = [];
  const { project: p, latest, candles, holderHistory, github, treasuryValue } = d;

  const hh = holderHistory.filter((h) => h.holder_count != null);
  if (hh.length >= 2) {
    const a = hh[0].holder_count!, b = hh[hh.length - 1].holder_count!;
    const days = Math.max(1, (hh[hh.length - 1].ts - hh[0].ts) / 86400);
    if (a > 0 && Math.abs((b - a) / a) > 0.02) {
      const pct = ((b - a) / a) * 100;
      out.push({
        kind: "holders", tone: pct > 0 ? "good" : "bad",
        text: `Holder count ${pct > 0 ? "grew" : "declined"} ${Math.abs(pct).toFixed(1)}% over ${Math.round(days)} days, to ${b.toLocaleString()} wallets.`,
      });
    }
  }

  if (candles.length >= 14) {
    const v7 = candles.slice(-7).reduce((s, c) => s + c.v, 0);
    const p7 = candles.slice(-14, -7).reduce((s, c) => s + c.v, 0);
    if (p7 > 0 && Math.abs(v7 / p7 - 1) > 0.4) {
      const pct = (v7 / p7 - 1) * 100;
      out.push({
        kind: "volume", tone: pct > 0 ? "good" : "neutral",
        text: `Weekly traded volume ${pct > 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(0)}% against the prior week.`,
      });
    }
    const ath = Math.max(...candles.map((c) => c.h));
    const cur = candles[candles.length - 1].c;
    if (cur >= ath * 0.95) {
      out.push({ kind: "price", tone: "good", text: "Trading within 5% of its all-time high." });
    } else if (cur <= ath * 0.35) {
      out.push({
        kind: "price", tone: "bad",
        text: `Down ${(((ath - cur) / ath) * 100).toFixed(0)}% from the all-time high.`,
      });
    }
  }

  if (latest?.liquidity_usd != null && latest.mcap) {
    const r = latest.liquidity_usd / latest.mcap;
    if (r > 0.15) out.push({ kind: "liquidity", tone: "good", text: `Unusually deep market — liquidity is ${(r * 100).toFixed(0)}% of market cap.` });
    if (r < 0.02) out.push({ kind: "liquidity", tone: "bad", text: `Thin market — liquidity is only ${(r * 100).toFixed(1)}% of market cap.` });
  }

  if (treasuryValue != null && latest?.mcap && treasuryValue > latest.mcap * 0.5) {
    out.push({
      kind: "treasury", tone: "good",
      text: `Treasury holds ${((treasuryValue / latest.mcap) * 100).toFixed(0)}% of the token's market cap, a substantial backing ratio.`,
    });
  }
  if (treasuryValue != null && p.raise_amount_usd && treasuryValue < p.raise_amount_usd * 0.15 && p.raise_amount_usd > 100_000) {
    out.push({
      kind: "treasury", tone: "bad",
      text: `Treasury has fallen to ${((treasuryValue / p.raise_amount_usd) * 100).toFixed(0)}% of the amount raised.`,
    });
  }

  if (github?.last_push_ts) {
    const days = (Date.now() / 1000 - github.last_push_ts) / 86400;
    if (days < 3) out.push({ kind: "dev", tone: "good", text: "Active development — code pushed within the last three days." });
    else if (days > 90) out.push({ kind: "dev", tone: "bad", text: `No public commits in ${Math.round(days)} days.` });
  }

  if (p.raise_committed_usd && p.raise_amount_usd && p.raise_amount_usd > 0) {
    const x = p.raise_committed_usd / p.raise_amount_usd;
    if (x >= 5) out.push({
      kind: "raise", tone: "neutral",
      text: `The raise drew ${x >= 10 ? Math.round(x) : x.toFixed(1)}× more demand than it accepted, so roughly ${(100 - (1 / x) * 100).toFixed(0)}% of commitments were refunded.`,
    });
  }

  return out;
}


// --------------------------------------------------------- developer score

export interface DevScore {
  overall: number | null;
  parts: { key: string; label: string; score: number | null; detail: string }[];
  measured: number;
  total: number;
}

/**
 * A composite of the engineering signals we hold, on the same rule as
 * healthScore: an input we cannot read is excluded rather than scored zero, so
 * a project is never marked down for a metric GitHub simply did not return.
 */
export function developerScore(g: ProjectDetail["github"], hasLink: boolean): DevScore {
  const parts: DevScore["parts"] = [];
  const now = Date.now() / 1000;

  if (!hasLink || !g) {
    return { overall: null, parts, measured: 0, total: 0 };
  }

  // Recency — the strongest single signal that a project is still being built.
  const commitTs = g.last_commit_ts ?? g.last_push_ts;
  if (commitTs) {
    const days = (now - commitTs) / 86400;
    parts.push({
      key: "recency", label: "Recency", score: band(60 - days, 0, 60),
      // Phrased through timeAgo so this cannot disagree with the "Last Commit"
      // tile rendered beside it — the two used to round the same gap differently.
      detail: days < 1 ? "committed today" : `last commit ${timeAgo(commitTs)}`,
    });
  } else {
    parts.push({ key: "recency", label: "Recency", score: null, detail: "no commit history read" });
  }

  if (g.commits_90d != null) {
    parts.push({
      key: "volume", label: "Commit Volume", score: band(g.commits_90d, 0, 300),
      detail: `${g.commits_90d.toLocaleString()} commits in 90d`,
    });
  } else {
    parts.push({ key: "volume", label: "Commit Volume", score: null, detail: "commit search unavailable" });
  }

  if (g.contributors != null) {
    parts.push({
      key: "team", label: "Contributors", score: band(g.contributors, 1, 15),
      detail: `${g.contributors} contributor${g.contributors === 1 ? "" : "s"}`,
    });
  } else {
    parts.push({ key: "team", label: "Contributors", score: null, detail: "contributor list unavailable" });
  }

  if (g.active_repos != null && g.repos) {
    parts.push({
      key: "breadth", label: "Active Repos", score: band(g.active_repos, 0, 6),
      detail: `${g.active_repos} of ${g.repos} repos pushed in 90d`,
    });
  } else {
    parts.push({ key: "breadth", label: "Active Repos", score: null, detail: "repo activity unavailable" });
  }

  // Issue hygiene: what share of all issues ever filed have been closed.
  if (g.closed_issues != null && g.open_issues != null && g.closed_issues + g.open_issues > 0) {
    const total = g.closed_issues + g.open_issues;
    const rate = (g.closed_issues / total) * 100;
    parts.push({
      key: "hygiene", label: "Issue Hygiene", score: band(rate, 20, 90),
      detail: `${rate.toFixed(0)}% of ${total.toLocaleString()} issues closed`,
    });
  } else {
    parts.push({ key: "hygiene", label: "Issue Hygiene", score: null, detail: "issue counts unavailable" });
  }

  const measured = parts.filter((p) => p.score != null);
  return {
    overall: measured.length ? Math.round(measured.reduce((s, p) => s + p.score!, 0) / measured.length) : null,
    parts,
    measured: measured.length,
    total: parts.length,
  };
}

// ------------------------------------------------------------ data coverage

export type CoverageStatus = "tracked" | "sparse" | "almost_empty" | "missing";
export type CoveragePriority = "critical" | "high" | "medium" | "low";

export interface CoverageRow {
  key: string;
  /** Domain heading this row sits under, so twenty rows stay readable. */
  group: string;
  label: string;
  status: CoverageStatus;
  /** What we actually hold right now, in the project's own numbers. */
  detail: string;
  /** Where the category is (or would be) sourced from. */
  source: string;
  /** Fixed editorial ranking of how much the gap matters — not derived per project. */
  priority: CoveragePriority;
}

const STATUS_LABEL: Record<CoverageStatus, string> = {
  tracked: "Tracked", sparse: "Sparse", almost_empty: "Almost Empty", missing: "Missing",
};

export function coverageColor(status: CoverageStatus): string {
  return { tracked: "var(--good)", sparse: "var(--warn)", almost_empty: "var(--serious)", missing: "var(--bad)" }[status];
}

export function coverageLabel(status: CoverageStatus): string {
  return STATUS_LABEL[status];
}

const DAY = 86400;

/**
 * Every intelligence category this terminal is meant to cover, scored against
 * what is actually indexed for this project.
 *
 * The point is that a blank section should never be ambiguous: a reader must be
 * able to tell "this project has no whales" from "we do not index whales yet".
 * Status is computed from the store on every render, so a category flips to
 * Tracked the moment its ingest lands — nothing here is hardcoded copy.
 */
export function dataCoverage(d: ProjectDetail): CoverageRow[] {
  const {
    project: p, latest, candles, github, news, events, topHolders, holderHistory,
    proposals, treasuryValue, treasuryHistory,
  } = d;
  const now = Date.now() / 1000;
  const rows: CoverageRow[] = [];
  const countOf = (type: string) => events.filter((e) => e.type === type).length;

  // ---------------------------------------------------------------- market

  rows.push(
    latest?.price_usd != null
      ? {
          key: "price", group: "Market", label: "Price & Market Cap", status: "tracked",
          detail: `Live quote${latest.mcap != null ? " with market cap" : "; no supply on file for a market cap"}`,
          source: "DexScreener / Jupiter", priority: "critical",
        }
      : {
          key: "price", group: "Market", label: "Price & Market Cap", status: "missing",
          detail: "No venue quotes this token", source: "DexScreener / Jupiter", priority: "critical",
        }
  );

  if (candles.length === 0) {
    rows.push({
      key: "candles", group: "Market", label: "Price History", status: "missing",
      detail: "No OHLCV history indexed", source: "GeckoTerminal", priority: "high",
    });
  } else {
    const days = Math.round((candles[candles.length - 1].ts - candles[0].ts) / DAY);
    rows.push({
      key: "candles", group: "Market", label: "Price History", status: candles.length >= 30 ? "tracked" : "sparse",
      detail: `${candles.length} daily candles spanning ${days}d, plus live intraday`,
      source: "GeckoTerminal", priority: "high",
    });
  }

  rows.push(
    latest?.liquidity_usd != null
      ? {
          key: "liquidity", group: "Market", label: "Liquidity & Volume", status: "tracked",
          detail: `Pool depth${latest.vol24h != null ? " and 24h volume" : "; no volume reported"}`,
          source: "DexScreener", priority: "high",
        }
      : {
          key: "liquidity", group: "Market", label: "Liquidity & Volume", status: "missing",
          detail: "No pool depth reported for this token", source: "DexScreener", priority: "high",
        }
  );

  if (d.listings.length === 0) {
    rows.push({
      key: "listings", group: "Market", label: "Exchange Listings", status: "missing",
      detail: p.mint ? "Not listed on CoinGecko, or no venues reported" : "No mint on file to look up",
      source: "CoinGecko", priority: "medium",
    });
  } else {
    const cex = d.listings.filter((l) => !l.is_dex).length;
    rows.push({
      key: "listings", group: "Market", label: "Exchange Listings", status: "tracked",
      detail: `${d.listings.length} venue${d.listings.length === 1 ? "" : "s"}${cex > 0 ? `, ${cex} centralised` : " (all on-chain)"}`,
      source: "CoinGecko", priority: "medium",
    });
  }

  // --------------------------------------------------------------- holders

  const counted = holderHistory.filter((h) => h.holder_count != null);
  rows.push(
    counted.length > 0
      ? {
          key: "holder_count", group: "Holders", label: "Holder Count", status: counted.length >= 5 ? "tracked" : "sparse",
          detail: `${counted[counted.length - 1].holder_count!.toLocaleString()} holders across ${counted.length} snapshot${counted.length === 1 ? "" : "s"}`,
          source: "Helius RPC", priority: "high",
        }
      : {
          key: "holder_count", group: "Holders", label: "Holder Count", status: "missing",
          detail: "No holder snapshots taken", source: "Helius RPC", priority: "high",
        }
  );

  // Distribution is a separate integration from the count: the count comes from
  // a cheap aggregate, the percentages need the full holder list walked.
  const withDist = holderHistory.filter((h) => h.top10_pct != null);
  rows.push(
    withDist.length > 0
      ? {
          key: "distribution", group: "Holders", label: "Holder Distribution", status: "tracked",
          detail: `Top 10 hold ${withDist[withDist.length - 1].top10_pct!.toFixed(1)}% of supply`,
          source: "Helius RPC", priority: "critical",
        }
      : {
          key: "distribution", group: "Holders", label: "Holder Distribution", status: "missing",
          detail: "Holder counts are indexed, but concentration percentages are not",
          source: "Helius RPC", priority: "critical",
        }
  );

  rows.push(
    topHolders.length > 0
      ? {
          key: "top_holders", group: "Holders", label: "Top Holders", status: topHolders.length >= 10 ? "tracked" : "sparse",
          detail: `${topHolders.length} wallet${topHolders.length === 1 ? "" : "s"} ranked by balance`,
          source: "Helius RPC", priority: "critical",
        }
      : {
          key: "top_holders", group: "Holders", label: "Top Holders", status: "missing",
          detail: "No holder list walked for this token", source: "Helius RPC", priority: "critical",
        }
  );

  const whales = countOf("whale_buy") + countOf("whale_sell");
  rows.push({
    key: "whales", group: "Holders", label: "Whale Tracking", status: whales > 0 ? "sparse" : "missing",
    detail: whales > 0 ? `${whales} large transfer${whales === 1 ? "" : "s"} flagged` : "Large transfers are not monitored",
    source: "Helius / Birdeye", priority: "high",
  });

  // Smart money needs both a holder list and wallet labels to sit on top of it.
  const labelled = topHolders.filter((h) => h.label).length;
  rows.push({
    key: "smart_money", group: "Holders", label: "Smart Money", status: labelled > 0 ? "sparse" : "missing",
    detail: labelled > 0
      ? `${labelled} of ${topHolders.length} top wallets classified`
      : "No wallet labelling — funds and desks are indistinguishable from retail",
    source: "Birdeye", priority: "high",
  });

  // ---------------------------------------------------- governance & treasury

  rows.push(
    proposals.length > 0
      ? {
          key: "proposals", group: "Governance & Treasury", label: "Governance Proposals", status: "tracked",
          detail: `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} indexed`,
          source: "Realms / MetaDAO", priority: "critical",
        }
      : {
          key: "proposals", group: "Governance & Treasury", label: "Governance Proposals", status: "missing",
          detail: p.dao_address ? "DAO address on file, but no proposals fetched" : "No DAO address on file to fetch proposals from",
          source: "Realms / MetaDAO", priority: "critical",
        }
  );

  const withVotes = proposals.filter((pr) => pr.state && pr.state !== "pending").length;
  rows.push({
    key: "votes", group: "Governance & Treasury", label: "Governance Votes", status: withVotes > 0 ? "sparse" : "missing",
    detail: withVotes > 0 ? `${withVotes} proposal${withVotes === 1 ? "" : "s"} carry an outcome, but not per-voter tallies` : "No vote records indexed",
    source: "Realms", priority: "high",
  });

  rows.push(
    treasuryValue != null
      ? {
          key: "treasury_value", group: "Governance & Treasury", label: "DAO Treasury Value", status: treasuryHistory.length >= 5 ? "tracked" : "sparse",
          detail: `${treasuryHistory.length} balance snapshot${treasuryHistory.length === 1 ? "" : "s"} on file`,
          source: "On-chain RPC", priority: "high",
        }
      : {
          key: "treasury_value", group: "Governance & Treasury", label: "DAO Treasury Value", status: "missing",
          detail: p.treasury_address ? "Treasury address on file, but no balance read" : "No treasury address on file",
          source: "On-chain RPC", priority: "high",
        }
  );

  // Balances over time are not the same as flows: a snapshot series cannot say
  // who was paid or what was sold, only that the total moved.
  rows.push({
    key: "treasury_activity", group: "Governance & Treasury", label: "DAO Treasury Activity",
    status: treasuryHistory.length >= 2 ? "sparse" : "missing",
    detail: treasuryHistory.length >= 2
      ? "Balance history only — individual inflows and outflows are not indexed"
      : "No treasury transaction history",
    source: "On-chain RPC", priority: "high",
  });

  // ------------------------------------------------------ project & comms

  if (!p.github) {
    rows.push({
      key: "github", group: "Project & Comms", label: "GitHub Activity", status: "missing",
      detail: "No GitHub organisation linked", source: "GitHub API", priority: "medium",
    });
  } else if (!github?.last_push_ts) {
    rows.push({
      key: "github", group: "Project & Comms", label: "GitHub Activity", status: "almost_empty",
      detail: "Linked, but no push history indexed yet", source: "GitHub API", priority: "medium",
    });
  } else {
    // Commits, contributors, issues, PRs, languages and weekly churn are all
    // indexed now, so this only stays Sparse when the deeper reads came back empty.
    const deep = github.commits_90d != null && github.contributors != null;
    rows.push({
      key: "github", group: "Project & Comms", label: "GitHub Activity",
      status: deep ? "tracked" : "sparse",
      detail: deep
        ? `${github.commits_90d!.toLocaleString()} commits in 90d from ${github.contributors} contributors across ${github.active_repos ?? 0} active repo${github.active_repos === 1 ? "" : "s"}`
        : `${github.repos ?? 0} repo${github.repos === 1 ? "" : "s"} · pushed ${timeAgo(github.last_push_ts)} — headline counters only`,
      source: "GitHub API", priority: "medium",
    });
  }

  const docsUrl = p.docs || p.whitepaper;
  rows.push(
    docsUrl
      ? {
          key: "docs", group: "Project & Comms", label: "Docs", status: "sparse",
          detail: "A docs link is on file, but its content isn't indexed", source: "Manual / GitHub", priority: "low",
        }
      : {
          key: "docs", group: "Project & Comms", label: "Docs", status: "missing",
          detail: "No docs or whitepaper link recorded", source: "Manual / GitHub", priority: "low",
        }
  );

  const realNews = news.filter((n) => n.type === "news");
  if (realNews.length === 0) {
    rows.push({
      key: "news", group: "Project & Comms", label: "News", status: "missing",
      detail: "No publisher has written about this project in the current wire window",
      source: "Publisher RSS", priority: "high",
    });
  } else {
    const recent = realNews.filter((n) => now - n.ts < 30 * DAY);
    const publishers = new Set(realNews.map((n) => n.source).filter(Boolean));
    rows.push({
      key: "news", group: "Project & Comms", label: "News", status: recent.length >= 3 ? "tracked" : "sparse",
      detail: `${realNews.length} article${realNews.length === 1 ? "" : "s"} from ${publishers.size} publisher${publishers.size === 1 ? "" : "s"}, most recent ${timeAgo(realNews[0].ts)}`,
      source: "Publisher RSS", priority: "high",
    });
  }

  const announced = countOf("announcement");
  const ghReleases = countOf("github_release");
  if (announced === 0 && ghReleases === 0) {
    rows.push({
      key: "announcements", group: "Project & Comms", label: "Announcements", status: "missing",
      detail: "No announcement feed indexed on X, Discord, or GitHub", source: "X, Discord, GitHub", priority: "high",
    });
  } else {
    rows.push({
      key: "announcements", group: "Project & Comms", label: "Announcements",
      status: announced > 0 ? "sparse" : "almost_empty",
      detail: announced > 0
        ? `${announced} announcement${announced === 1 ? "" : "s"} plus ${ghReleases} GitHub release${ghReleases === 1 ? "" : "s"}`
        : `${ghReleases} GitHub release${ghReleases === 1 ? "" : "s"} only — no X or Discord feed`,
      source: "X, Discord, GitHub", priority: "high",
    });
  }

  const partnerships = countOf("partnership");
  rows.push({
    key: "partnerships", group: "Project & Comms", label: "Partnerships", status: partnerships > 0 ? "sparse" : "missing",
    detail: partnerships > 0 ? `${partnerships} partnership event${partnerships === 1 ? "" : "s"}` : "No partnership feed integrated",
    source: "Manual / RSS", priority: "low",
  });

  // ------------------------------------------------------------------ risk

  const unlocks = countOf("unlock");
  rows.push({
    key: "unlocks", group: "Risk", label: "Token Unlocks", status: unlocks > 0 ? "sparse" : "missing",
    detail: unlocks > 0
      ? `${unlocks} unlock event${unlocks === 1 ? "" : "s"} on the calendar`
      : p.team_package
        ? "A locked team package is recorded, but no vesting schedule is indexed"
        : "No unlock schedule indexed",
    source: "DefiLlama", priority: "high",
  });

  if (!d.risk) {
    rows.push({
      key: "risk", group: "Risk", label: "Risk Score", status: "missing",
      detail: "No contract-level risk check — mint authority, freeze authority and LP locks are unverified",
      source: "RugCheck", priority: "medium",
    });
  } else {
    const flags = parseRisks(d.risk);
    const danger = flags.filter((f) => f.level === "danger").length;
    rows.push({
      key: "risk", group: "Risk", label: "Risk Score", status: "tracked",
      detail: `${d.risk.score_normalised ?? "?"}/100 safety · ${flags.length} flag${flags.length === 1 ? "" : "s"}${danger ? `, ${danger} critical` : ""}`,
      source: "RugCheck", priority: "medium",
    });
  }

  return rows;
}
