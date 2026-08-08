import Link from "next/link";
import type { ScreenerRow } from "@/lib/queries";
import type { Scoreboard } from "@/lib/scoreboard";
import { recentCloses } from "@/lib/queries";
import { IconBadge, type IconName } from "./viz";
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

/**
 * The trust strip under the two cards. Static copy about the platform, so it
 * takes no data — it sits here rather than in its own file because it only
 * ever appears directly beneath these two.
 */
const FEATURES: { icon: IconName; color: string; title: string; blurb: string }[] = [
  { icon: "shield", color: "var(--accent)", title: "Verified data", blurb: "All data is verified and cross-checked" },
  { icon: "info", color: "var(--good)", title: "No hidden gaps", blurb: "Every gap is disclosed, not estimated" },
  { icon: "layers", color: "#9b7ae0", title: "On-chain first", blurb: "Data read directly from blockchain & public sources" },
  { icon: "bank", color: "#e08a3c", title: "Institutional grade", blurb: "Built for analysts, investors & DAOs" },
  { icon: "token", color: "var(--warn)", title: "Multi-chain coverage", blurb: "100+ chains and L2s supported" },
];

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
      {/* `grid-cols-1` is stated rather than left implicit: an implicit `auto`
          track sizes to its widest item's max-content and will not shrink below
          it, which pushed both cards ~126px past the viewport on a phone. The
          `grid-cols-*` utilities compile to `minmax(0, 1fr)`, which caps it. */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Both cards, and the selection they share — picking a project has to
            move the figures on the left and the readings on the right. */}
        <IntelligencePair projects={projects} />
      </div>

      {/*
       * Trust strip. Five across on a desktop with hairlines between, two up on
       * a tablet and stacked on a phone — the rules are `lg`-only because
       * `divide-x` borders every child but the first in DOM order, which is the
       * divider you want in one row and the wrong one entirely once it wraps.
       */}
      <div className="card grid grid-cols-1 gap-6 px-5 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:gap-0 lg:divide-x lg:divide-line">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex items-start gap-3 lg:px-5 lg:first:pl-0 lg:last:pr-0">
            <IconBadge name={f.icon} color={f.color} size={34} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{f.title}</div>
              <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{f.blurb}</div>
            </div>
          </div>
        ))}
      </div>

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
        <Link
          href="#faq-heading"
          className="shrink-0 text-[11.5px] font-medium text-ink2 transition-colors duration-150 hover:text-brand"
        >
          Learn more <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
