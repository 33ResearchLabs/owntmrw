import { projectDetail, parseRisks, type ScreenerRow } from "./queries";
import { healthScore, insights } from "./analytics";

/**
 * Health scores for every project at once, for the home page's research
 * section.
 *
 * Every project's score is recomputed here rather than read from a cache: the
 * inputs are already in SQLite and `liveQuotes`/`liveTreasury` are shared
 * across the render, so the whole set costs about a tenth of a second. A
 * stored ranking would be a second source of truth for a number the project
 * pages already derive, and the two would eventually disagree.
 */

/**
 * A project's health score, decomposed into what produced it.
 *
 * `contribution` is the part of `overall` this dimension accounts for —
 * `score / measured`, since the overall is the mean of whatever was measurable.
 * They sum to `overall`, which is what makes stacking them legitimate: the bar
 * is the score, and each band is a real share of it. Stacking the raw 0–100
 * scores would produce a 400-tall bar that means nothing.
 */
export interface ScoredProject {
  slug: string;
  name: string;
  symbol: string | null;
  image_url: string | null;
  overall: number;
  measured: number;
  total: number;
  parts: { key: string; score: number; contribution: number }[];
}

export interface FeaturedScore extends ScoredProject {
  /** 1-based position among all scored projects, best first. */
  rank: number;
  ranked: number;
  /** Names of the contract risk flags on file, worst first. */
  risks: string[];
  /** Measured observations about this project, newest logic first. */
  insights: string[];
}

export interface Scoreboard {
  projects: ScoredProject[];
  featured: FeaturedScore | null;
  /** Dimensions at least one project measures, in the order bars stack. */
  series: { key: string; label: string; color: string }[];
}

/**
 * The dimensions a health score is built from, in stacking order.
 *
 * Colours are the language bar's palette — the one categorical set this
 * codebase already had, reused rather than invented so two stacked bars on the
 * same site do not use two different systems. Status colours (good/bad/warn)
 * are deliberately not in here: they mean a verdict elsewhere on the page and
 * must not read as "series 3".
 */
const SERIES: { key: string; label: string; color: string }[] = [
  { key: "treasury", label: "Treasury", color: "#3987e5" },
  { key: "holders", label: "Holder Growth", color: "#0ca30c" },
  { key: "concentration", label: "Distribution", color: "#fab219" },
  { key: "liquidity", label: "Liquidity", color: "#d55181" },
  { key: "dev", label: "Developer Activity", color: "#9085e9" },
  { key: "governance", label: "Governance", color: "#199e70" },
  { key: "momentum", label: "Momentum", color: "#d95926" },
];

export async function scoreboard(
  rows: ScreenerRow[],
  featuredSlug: string | null
): Promise<Scoreboard> {
  const scored: ScoredProject[] = [];
  let featured: FeaturedScore | null = null;
  const seen = new Set<string>();

  for (const r of rows) {
    const d = await projectDetail(r.slug);
    if (!d) continue;
    const hs = healthScore(d);
    if (hs.overall == null || !hs.measured) continue;

    const parts = hs.components
      .filter((c): c is typeof c & { score: number } => c.score != null)
      .map((c) => ({ key: c.key, score: c.score, contribution: c.score / hs.measured }));
    parts.forEach((p) => seen.add(p.key));

    const project: ScoredProject = {
      slug: r.slug, name: r.name, symbol: r.symbol, image_url: r.image_url,
      overall: hs.overall, measured: hs.measured, total: hs.total, parts,
    };
    scored.push(project);

    if (r.slug === featuredSlug) {
      featured = {
        ...project,
        rank: 0, ranked: 0,
        // Worst first, so two chips show the two that matter.
        risks: parseRisks(d.risk)
          .sort((a, b) => b.score - a.score)
          .map((f) => f.name),
        insights: insights(d).map((i) => i.text),
      };
    }
  }

  scored.sort((a, b) => b.overall - a.overall);
  if (featured) {
    featured.rank = scored.findIndex((p) => p.slug === featured!.slug) + 1;
    featured.ranked = scored.length;
  }

  return {
    projects: scored,
    featured,
    // A dimension nothing measures — governance, until proposals are indexed —
    // would otherwise sit in the legend as a colour that never appears.
    series: SERIES.filter((s) => seen.has(s.key)),
  };
}
