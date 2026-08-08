import type { ScreenerRow } from "@/lib/queries";
import { IconBadge, type IconName } from "./viz";
import { Eyebrow, CardCta, IntelligenceCard, type IntelProject } from "./IntelligenceCard";

/**
 * The two explainer cards under the explorer table: what the product measures,
 * and how.
 *
 * The left card is a real project rather than a mock — every figure on it is
 * the same reading the project's own page would show, and each row deep-links
 * to the tab it came from. A screenshot-shaped placeholder would have been
 * less work and would have aged into a lie the first time a tab moved.
 *
 * That card is a client component (`IntelligenceCard`) because it carries the
 * project picker; everything else here is static copy and stays on the server.
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
export function intelProjects(rows: ScreenerRow[]): IntelProject[] {
  return [...rows]
    .filter((r) => filled(r) >= 3)
    .sort(byCompleteness)
    .map((r) => ({
      slug: r.slug, name: r.name, category: r.category, image_url: r.image_url,
      raise_amount_usd: r.raise_amount_usd, treasury_usd: r.treasury_usd,
      holder_count: r.holder_count, gh_last_push: r.gh_last_push,
      roi_since_raise: r.roi_since_raise,
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

/**
 * What every project page is built from. Static because it describes the
 * product, not a reading — but each entry names a tab that genuinely exists,
 * so the list cannot drift into claiming coverage the app does not have.
 */
const METHOD: { icon: IconName; color: string; title: string; blurb: string }[] = [
  { icon: "pie", color: "#9b7ae0", title: "Treasury Analysis", blurb: "On-chain treasury balance, flows, and capital efficiency" },
  { icon: "users", color: "var(--good)", title: "Holder Analysis", blurb: "Holder distribution, concentration, and wallet behaviour" },
  { icon: "bars", color: "var(--accent)", title: "Development Activity", blurb: "GitHub commits, contributors, and repo health" },
  { icon: "chart", color: "#e08a3c", title: "Market & Performance", blurb: "Liquidity, price performance, and market momentum" },
  { icon: "shield", color: "var(--warn)", title: "Governance Activity", blurb: "Proposal activity, voting participation, and treasury usage" },
  { icon: "target", color: "#9b7ae0", title: "AI Intelligence", blurb: "Generated summaries, read from verified on-chain data" },
];

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--good)"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function IntelligenceSection({ rows }: { rows: ScreenerRow[] }) {
  const projects = intelProjects(rows);
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
        <IntelligenceCard projects={projects} />

        <div className="card flex h-full flex-col gap-6 p-5 sm:p-6">
          {/* Mirrors the intelligence card's header exactly — same eyebrow-row
              floor, same margins — so both headings, descriptions and rules sit
              on the same lines. */}
          <div>
            {/* 45px, not 42: the floor exists to match the selector opposite,
                and that control is 45px tall — its two lines of text, not its
                28px logo, are what set the height. At 42 the floor was three
                short, so this heading sat above its neighbour rather than
                level with it. */}
            <div className="flex min-h-[45px] items-center">
              <Eyebrow label="Methodology" color="#9b7ae0" />
            </div>
            <h2 className="mt-4 text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-[30px]">
              Transparent<br />research methodology.
            </h2>
            <p className="mt-4 min-h-[41px] text-[12.5px] leading-relaxed text-ink2">
              Every figure is read from public sources, and every gap is named rather than filled.
            </p>
          </div>

          {/* One rule above the list, where the header ends — the per-row rules
              this replaces were six lines doing the work of spacing. The row
              padding matches the facet cards opposite, less the 1px those spend
              on their border, so the first row of each starts on one line. */}
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            {METHOD.map((m) => (
              <div key={m.title} className="flex items-center gap-3.5 rounded-xl px-2 py-3.5">
                <IconBadge name={m.icon} color={m.color} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{m.title}</div>
                  <div className="truncate text-[11.5px] text-muted">{m.blurb}</div>
                </div>
                <Check />
              </div>
            ))}
          </div>

          <CardCta href="/screener">See it applied across every project</CardCta>
        </div>
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
    </section>
  );
}
