import type { ScreenerRow } from "@/lib/queries";
import type { Scoreboard } from "@/lib/scoreboard";
import { recentCloses } from "@/lib/queries";
import { IntelligencePair, type IntelProject } from "./IntelligenceCard";

/**
 * The two explainer cards under the explorer table: what the product measures,
 * and how.
 *
 * The left card is a real project rather than a mock — every figure on it is
 * the same reading the project's own page would show, and each row deep-links
 * to the tab it came from. A screenshot-shaped placeholder would have been
 * less work and would have aged into a lie the first time a tab moved.
 *
 * Both cards are client components: the left one carries the project picker,
 * and the trade panel beside it reads whatever that picker selects. What stays
 * on the server is this file — choosing the list, and the two strips below.
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
    /*
     * Each heading lives inside its own card, like every other section on the
     * page. `items-stretch` plus `h-full` keeps the two the same height however
     * many rows each carries, and the footer links are pinned with `mt-auto`
     * so they still end on the same line.
     */
    <section className="space-y-6">
      <IntelligencePair projects={projects} />

      {/*
       * The standing disclaimer. It sits under the trade panel's readings
       * because that panel states a stance on a project — the line says what
       * that stance is and is not, at the size the rest of the page's footnotes
       * are set in rather than as fine print.
       */}
      <div className="card flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <span className="shrink-0 text-muted" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.5 4.5 6.8v4.9c0 4.4 3.1 7.6 7.5 8.8 4.4-1.2 7.5-4.4 7.5-8.8V6.8Z" />
            <path d="M12 9v4" /><path d="M12 16h.01" />
          </svg>
        </span>
        <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
          Underly is a data intelligence platform, not an investment advisor. Every reading is
          computed from public on-chain and off-chain sources, and none of it is financial advice.
        </p>
        {/* No "Learn more" beside it any more: it pointed at the FAQ, and with
            that parked there is nowhere on the site this could honestly go. A
            disclaimer that links nowhere is still a disclaimer; one that links
            to a page not answering it is worse than none. */}
      </div>
    </section>
  );
}
