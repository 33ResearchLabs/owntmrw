import type { ScreenerRow } from "@/lib/queries";
import type { Scoreboard } from "@/lib/scoreboard";
import { recentCloses } from "@/lib/queries";
import type { IntelProject } from "./IntelligenceCard";
import { IntelligenceShowcase } from "./IntelligenceShowcase";

/**
 * The three-column instrument under the explorer table: what the product
 * measures, a live snapshot of one project, and the trade panel that follows
 * from it.
 *
 * The snapshot is a real project rather than a mock — every figure on it is
 * the same reading the project's own page would show, and each row deep-links
 * to the tab it came from. A screenshot-shaped placeholder would have been
 * less work and would have aged into a lie the first time a tab moved.
 *
 * `IntelligenceShowcase` is a client component — it carries the project picker,
 * and the trade panel reads whatever that picker selects. What stays on the
 * server is this file: choosing the list.
 */

/**
 * How much of the card a project can actually fill: how many of its five
 * headline figures are on file. Three is the floor for appearing at all, so
 * neither the default nor anything reachable from the picker is a card of
 * dashes.
 */
function filled(r: ScreenerRow): number {
  return [r.raise_amount_usd, r.treasury_usd, r.holder_count, r.gh_last_push, r.roi_since_raise]
    .filter((v) => v != null).length;
}

/** Fullest card first, biggest project breaking ties. */
function byCompleteness(a: ScreenerRow, b: ScreenerRow): number {
  return filled(b) - filled(a) || (b.mcap ?? 0) - (a.mcap ?? 0);
}

/**
 * The featured project: the one with the most of these five figures actually
 * on file, biggest first to break ties.
 *
 * Picked rather than pinned because the card is five figures wide and a pinned
 * slug that loses its GitHub link or its treasury reading would leave the
 * marketing section on the front page full of dashes.
 */
export function pickFeatured(rows: ScreenerRow[]): ScreenerRow | null {
  const best = [...rows].sort(byCompleteness)[0];
  return best && filled(best) >= 3 ? best : null;
}

/**
 * Every project the picker offers, in the order it offers them — flattened to
 * the nine fields the card reads, because the whole list crosses into the
 * client bundle and a `ScreenerRow` carries thirty-odd it does not.
 *
 * Sorted by the same comparator `pickFeatured` uses, so the first entry — the
 * card's default — is the featured project by construction rather than by two
 * rules that have to be kept in agreement.
 */
export function intelProjects(rows: ScreenerRow[], board: Scoreboard): IntelProject[] {
  // Scores and price series are looked up per project, so both are indexed once
  // rather than scanned for each of the twenty-odd rows below.
  const scored = new Map(board.projects.map((p) => [p.slug, p]));
  const closes = recentCloses(30);
  const part = (slug: string, key: string) =>
    scored.get(slug)?.parts.find((q) => q.key === key)?.score ?? null;

  return [...rows]
    .filter((r) => filled(r) >= 3)
    .sort(byCompleteness)
    .map((r) => ({
      slug: r.slug, name: r.name, symbol: r.symbol, category: r.category,
      image_url: r.image_url,
      raise_amount_usd: r.raise_amount_usd, treasury_usd: r.treasury_usd,
      holder_count: r.holder_count, gh_last_push: r.gh_last_push,
      roi_since_raise: r.roi_since_raise,
      change_24h: r.change_24h,
      overall: scored.get(r.slug)?.overall ?? null,
      measured: scored.get(r.slug)?.measured ?? 0,
      total: scored.get(r.slug)?.total ?? 0,
      concentrationScore: part(r.slug, "concentration"),
      liquidityScore: part(r.slug, "liquidity"),
      spark: closes.get(r.slug) ?? [],
    }));
}

export function IntelligenceSection({ rows, board }: { rows: ScreenerRow[]; board: Scoreboard }) {
  const projects = intelProjects(rows, board);
  if (!projects.length) return null;

  return (
    <section className="space-y-6">
      <IntelligenceShowcase projects={projects} />
    </section>
  );
}
