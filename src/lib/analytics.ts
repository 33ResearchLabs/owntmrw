import type { ProjectDetail } from "./queries";
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
  const {
    project: p,
    latest,
    candles,
    holderHistory,
    github,
    treasuryValue,
    proposals,
  } = d;
  const components: ScoreComponent[] = [];

  // --- Treasury: runway relative to what was raised, and absolute size.
  if (treasuryValue != null) {
    const vsRaise = p.raise_amount_usd
      ? treasuryValue / p.raise_amount_usd
      : null;
    const score =
      vsRaise != null
        ? band(vsRaise, 0, 1.2)
        : band(Math.log10(Math.max(treasuryValue, 1)), 3, 7); // $1k → $10M
    components.push({
      key: "treasury",
      label: "Treasury",
      score,
      detail:
        vsRaise != null
          ? `${(vsRaise * 100).toFixed(0)}% of the raise still held`
          : `${treasuryValue >= 1e6 ? `$${(treasuryValue / 1e6).toFixed(1)}M` : `$${Math.round(treasuryValue).toLocaleString()}`} on-chain`,
    });
  } else {
    components.push({
      key: "treasury",
      label: "Treasury",
      score: null,
      detail: "no treasury vault indexed",
    });
  }

  // --- Holder growth: trend across snapshots.
  const hh = holderHistory.filter((h) => h.holder_count != null);
  if (hh.length >= 2) {
    const first = hh[0].holder_count!,
      lastH = hh[hh.length - 1].holder_count!;
    const pct = first > 0 ? ((lastH - first) / first) * 100 : 0;
    components.push({
      key: "holders",
      label: "Holder Growth",
      score: band(pct, -10, 25),
      detail: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% since tracking began`,
    });
  } else {
    const only = hh[0]?.holder_count;
    components.push({
      key: "holders",
      label: "Holder Growth",
      score: null,
      detail:
        only != null
          ? `${only.toLocaleString()} holders — needs more history`
          : "no holder data",
    });
  }

  // --- Concentration: lower top-10 share scores higher.
  const t10 = [...holderHistory]
    .reverse()
    .find((h) => h.top10_pct != null)?.top10_pct;
  if (t10 != null) {
    components.push({
      key: "concentration",
      label: "Distribution",
      score: band(100 - t10, 20, 75),
      detail: `top 10 hold ${t10.toFixed(1)}% of supply`,
    });
  } else {
    components.push({
      key: "concentration",
      label: "Distribution",
      score: null,
      detail: "holder list unavailable",
    });
  }

  // --- Liquidity: depth relative to market cap.
  if (latest?.liquidity_usd != null && latest.mcap) {
    const ratio = latest.liquidity_usd / latest.mcap;
    components.push({
      key: "liquidity",
      label: "Liquidity",
      score: band(ratio * 100, 1, 25),
      detail: `${(ratio * 100).toFixed(1)}% of market cap is liquid`,
    });
  } else {
    components.push({
      key: "liquidity",
      label: "Liquidity",
      score: null,
      detail: "no pool data",
    });
  }

  // --- Developer activity: recency of pushes.
  if (github?.last_push_ts) {
    const days = (Date.now() / 1000 - github.last_push_ts) / 86400;
    components.push({
      key: "dev",
      label: "Developer Activity",
      score: band(60 - days, 0, 60),
      detail: days < 1 ? "pushed today" : `last push ${Math.round(days)}d ago`,
    });
  } else {
    components.push({
      key: "dev",
      label: "Developer Activity",
      score: null,
      detail: "no GitHub linked",
    });
  }

  // --- Governance: proposal throughput.
  if (proposals.length > 0) {
    components.push({
      key: "governance",
      label: "Governance",
      score: band(proposals.length, 0, 12),
      detail: `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} indexed`,
    });
  } else {
    components.push({
      key: "governance",
      label: "Governance",
      score: null,
      detail: "no proposals indexed",
    });
  }

  // --- Momentum: 30d price trend blended with volume-to-liquidity.
  if (candles.length >= 8) {
    const win = candles.slice(-30);
    const chg =
      win[0].c > 0
        ? ((candles[candles.length - 1].c - win[0].c) / win[0].c) * 100
        : 0;
    const turn =
      latest?.vol24h && latest.liquidity_usd
        ? latest.vol24h / latest.liquidity_usd
        : null;
    const priceScore = band(chg, -50, 50);
    const score =
      turn != null
        ? Math.round(priceScore * 0.7 + band(turn, 0, 1.5) * 0.3)
        : priceScore;
    components.push({
      key: "momentum",
      label: "Momentum",
      score,
      detail: `${chg >= 0 ? "+" : ""}${chg.toFixed(0)}% over ${win.length}d`,
    });
  } else {
    components.push({
      key: "momentum",
      label: "Momentum",
      score: null,
      detail: "insufficient price history",
    });
  }

  const measured = components.filter((c) => c.score != null);
  const overall = measured.length
    ? Math.round(measured.reduce((s, c) => s + c.score!, 0) / measured.length)
    : null;

  return {
    overall,
    components,
    measured: measured.length,
    total: components.length,
  };
}

export function scoreColor(score: number | null): string {
  if (score == null) return "var(--ink-muted)";
  if (score >= 75) return "var(--good)";
  if (score >= 50) return "var(--warn)";
  if (score >= 30) return "var(--serious)";
  return "var(--bad)";
}

// ---------------------------------------------------------------- insights

export interface Insight {
  text: string;
  kind: string;
  tone: "good" | "bad" | "neutral";
}

/** Observations generated from measured changes only — never speculation. */
export function insights(d: ProjectDetail): Insight[] {
  const out: Insight[] = [];
  const {
    project: p,
    latest,
    candles,
    holderHistory,
    github,
    treasuryValue,
  } = d;

  const hh = holderHistory.filter((h) => h.holder_count != null);
  if (hh.length >= 2) {
    const a = hh[0].holder_count!,
      b = hh[hh.length - 1].holder_count!;
    const days = Math.max(1, (hh[hh.length - 1].ts - hh[0].ts) / 86400);
    if (a > 0 && Math.abs((b - a) / a) > 0.02) {
      const pct = ((b - a) / a) * 100;
      out.push({
        kind: "holders",
        tone: pct > 0 ? "good" : "bad",
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
        kind: "volume",
        tone: pct > 0 ? "good" : "neutral",
        text: `Weekly traded volume ${pct > 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(0)}% against the prior week.`,
      });
    }
    const ath = Math.max(...candles.map((c) => c.h));
    const cur = candles[candles.length - 1].c;
    if (cur >= ath * 0.95) {
      out.push({
        kind: "price",
        tone: "good",
        text: "Trading within 5% of its all-time high.",
      });
    } else if (cur <= ath * 0.35) {
      out.push({
        kind: "price",
        tone: "bad",
        text: `Down ${(((ath - cur) / ath) * 100).toFixed(0)}% from the all-time high.`,
      });
    }
  }

  if (latest?.liquidity_usd != null && latest.mcap) {
    const r = latest.liquidity_usd / latest.mcap;
    if (r > 0.15)
      out.push({
        kind: "liquidity",
        tone: "good",
        text: `Unusually deep market — liquidity is ${(r * 100).toFixed(0)}% of market cap.`,
      });
    if (r < 0.02)
      out.push({
        kind: "liquidity",
        tone: "bad",
        text: `Thin market — liquidity is only ${(r * 100).toFixed(1)}% of market cap.`,
      });
  }

  if (
    treasuryValue != null &&
    latest?.mcap &&
    treasuryValue > latest.mcap * 0.5
  ) {
    out.push({
      kind: "treasury",
      tone: "good",
      text: `Treasury holds ${((treasuryValue / latest.mcap) * 100).toFixed(0)}% of the token's market cap, a substantial backing ratio.`,
    });
  }
  if (
    treasuryValue != null &&
    p.raise_amount_usd &&
    treasuryValue < p.raise_amount_usd * 0.15 &&
    p.raise_amount_usd > 100_000
  ) {
    out.push({
      kind: "treasury",
      tone: "bad",
      text: `Treasury has fallen to ${((treasuryValue / p.raise_amount_usd) * 100).toFixed(0)}% of the amount raised.`,
    });
  }

  if (github?.last_push_ts) {
    const days = (Date.now() / 1000 - github.last_push_ts) / 86400;
    if (days < 3)
      out.push({
        kind: "dev",
        tone: "good",
        text: "Active development — code pushed within the last three days.",
      });
    else if (days > 90)
      out.push({
        kind: "dev",
        tone: "bad",
        text: `No public commits in ${Math.round(days)} days.`,
      });
  }

  if (p.raise_committed_usd && p.raise_amount_usd && p.raise_amount_usd > 0) {
    const x = p.raise_committed_usd / p.raise_amount_usd;
    if (x >= 5)
      out.push({
        kind: "raise",
        tone: "neutral",
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
export function developerScore(
  g: ProjectDetail["github"],
  hasLink: boolean,
): DevScore {
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
      key: "recency",
      label: "Recency",
      score: band(60 - days, 0, 60),
      // Phrased through timeAgo so this cannot disagree with the "Last Commit"
      // tile rendered beside it — the two used to round the same gap differently.
      detail: days < 1 ? "committed today" : `last commit ${timeAgo(commitTs)}`,
    });
  } else {
    parts.push({
      key: "recency",
      label: "Recency",
      score: null,
      detail: "no commit history read",
    });
  }

  if (g.commits_90d != null) {
    parts.push({
      key: "volume",
      label: "Commit Volume",
      score: band(g.commits_90d, 0, 300),
      detail: `${g.commits_90d.toLocaleString()} commits in 90d`,
    });
  } else {
    parts.push({
      key: "volume",
      label: "Commit Volume",
      score: null,
      detail: "commit search unavailable",
    });
  }

  if (g.contributors != null) {
    parts.push({
      key: "team",
      label: "Contributors",
      score: band(g.contributors, 1, 15),
      detail: `${g.contributors} contributor${g.contributors === 1 ? "" : "s"}`,
    });
  } else {
    parts.push({
      key: "team",
      label: "Contributors",
      score: null,
      detail: "contributor list unavailable",
    });
  }

  if (g.active_repos != null && g.repos) {
    parts.push({
      key: "breadth",
      label: "Active Repos",
      score: band(g.active_repos, 0, 6),
      detail: `${g.active_repos} of ${g.repos} repos pushed in 90d`,
    });
  } else {
    parts.push({
      key: "breadth",
      label: "Active Repos",
      score: null,
      detail: "repo activity unavailable",
    });
  }

  // Issue hygiene: what share of all issues ever filed have been closed.
  if (
    g.closed_issues != null &&
    g.open_issues != null &&
    g.closed_issues + g.open_issues > 0
  ) {
    const total = g.closed_issues + g.open_issues;
    const rate = (g.closed_issues / total) * 100;
    parts.push({
      key: "hygiene",
      label: "Issue Hygiene",
      score: band(rate, 20, 90),
      detail: `${rate.toFixed(0)}% of ${total.toLocaleString()} issues closed`,
    });
  } else {
    parts.push({
      key: "hygiene",
      label: "Issue Hygiene",
      score: null,
      detail: "issue counts unavailable",
    });
  }

  const measured = parts.filter((p) => p.score != null);
  return {
    overall: measured.length
      ? Math.round(measured.reduce((s, p) => s + p.score!, 0) / measured.length)
      : null,
    parts,
    measured: measured.length,
    total: parts.length,
  };
}
