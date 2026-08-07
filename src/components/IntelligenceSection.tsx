import Link from "next/link";
import type { ScreenerRow } from "@/lib/queries";
import { Logo } from "./ui";
import { IconBadge, type IconName } from "./viz";
import { fmtUsd, fmtNum, fmtPct, timeAgo } from "@/lib/format";

/**
 * The two explainer cards under the explorer table: what the product measures,
 * and how.
 *
 * The left card is a real project rather than a mock — every figure on it is
 * the same reading the project's own page would show, and each row deep-links
 * to the tab it came from. A screenshot-shaped placeholder would have been
 * less work and would have aged into a lie the first time a tab moved.
 */

/** One row of the left card: a measure, and where to read more of it. */
interface Facet {
  icon: IconName;
  color: string;
  title: string;
  blurb: string;
  /** The project-page tab this row opens. */
  tab: string;
  value: React.ReactNode;
  /** What the figure is, under it. */
  unit: string;
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
  const score = (r: ScreenerRow) =>
    [r.raise_amount_usd, r.treasury_usd, r.holder_count, r.gh_last_push, r.roi_since_raise]
      .filter((v) => v != null).length;
  const best = [...rows].sort(
    (a, b) => score(b) - score(a) || (b.mcap ?? 0) - (a.mcap ?? 0)
  )[0];
  return best && score(best) >= 3 ? best : null;
}

/*
 * A row is its own bordered card rather than a rule-separated band. Same link,
 * same figures — the border moves from between the rows to around each of them,
 * which is what lets the padding grow without the card reading as one long
 * ruled table.
 */
function FacetRow({ slug, f }: { slug: string; f: Facet }) {
  return (
    <Link
      href={`/project/${slug}#${f.tab}`}
      className="flex items-center gap-3.5 rounded-xl border border-line bg-surface2/40 px-4 py-3.5 transition-colors duration-150 hover:border-line2 hover:bg-surface2"
    >
      <IconBadge name={f.icon} color={f.color} size={38} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{f.title}</div>
        <div className="truncate text-[11.5px] text-muted">{f.blurb}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[13.5px] font-semibold">{f.value}</div>
        <div className="text-[10.5px] text-muted">{f.unit}</div>
      </div>
      <span className="shrink-0 text-[15px] text-faint" aria-hidden>›</span>
    </Link>
  );
}

/** Eyebrow tag above each card's heading — the label and its dot. */
function Eyebrow({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ color }}
    >
      {label}
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </div>
  );
}

/** The shared footer action, as a full-width button rather than a ruled strip. */
function CardCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2/40 px-4 py-3.5 text-[13px] font-medium text-ink2 transition-colors duration-150 hover:border-line2 hover:bg-surface2 hover:text-ink"
    >
      {children} <span aria-hidden>→</span>
    </Link>
  );
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

export function IntelligenceSection({ featured }: { featured: ScreenerRow | null }) {
  if (!featured) return null;
  const r = featured;

  // Treasury against what was raised — the card's one derived figure, and it
  // only appears when both halves are real and the raise was non-zero.
  const remaining = r.treasury_usd != null && r.raise_amount_usd
    ? (r.treasury_usd / r.raise_amount_usd) * 100 : null;

  const dash = <span className="text-muted">—</span>;
  const facets: Facet[] = [
    {
      icon: "token", color: "var(--accent)", tab: "overview",
      title: "Raise Overview", blurb: "Funding details and round information",
      value: r.raise_amount_usd != null ? fmtUsd(r.raise_amount_usd) : dash, unit: "Raised",
    },
    {
      icon: "bank", color: "var(--good)", tab: "treasury",
      title: "Treasury", blurb: "On-chain treasury and capital allocation",
      value: r.treasury_usd != null ? fmtUsd(r.treasury_usd) : dash,
      unit: remaining != null ? `${remaining.toFixed(0)}% of raise held` : "on-chain balance",
    },
    {
      icon: "users", color: "#9b7ae0", tab: "holders",
      title: "Holders", blurb: "Holder distribution and concentration",
      value: r.holder_count != null ? fmtNum(r.holder_count) : dash, unit: "Total holders",
    },
    {
      icon: "bars", color: "#e08a3c", tab: "development",
      title: "Development", blurb: "GitHub activity and developer performance",
      value: r.gh_last_push ? timeAgo(r.gh_last_push) : dash, unit: "Last commit",
    },
    {
      icon: "chart", color: "var(--warn)", tab: "overview",
      title: "Performance", blurb: "Market performance since launch",
      value: r.roi_since_raise != null
        ? <span className={r.roi_since_raise >= 0 ? "text-good" : "text-bad"}>{fmtPct(r.roi_since_raise)}</span>
        : dash,
      unit: "ROI since raise",
    },
  ];

  return (
    /*
     * Each heading lives inside its own card, like every other section on the
     * page. `items-stretch` plus `h-full` keeps the two the same height however
     * many rows each carries, and the footer links are pinned with `mt-auto`
     * so they still end on the same line.
     */
    <section className="space-y-6">
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <div className="card flex h-full flex-col gap-6 p-5 sm:p-6">
          {/*
           * Header block, identical in shape to the methodology card's so the
           * two line up: an eyebrow row of a fixed height, then the heading and
           * the description on the same margins. The row is sized to the
           * selector, which only the left card carries — without the floor the
           * right card's eyebrow would collapse to its text height and pull its
           * heading a selector's worth of space higher.
           */}
          <div>
            <div className="flex min-h-[42px] items-center justify-between gap-4">
              <Eyebrow label="Project Intelligence" color="var(--accent)" />
              <div className="inline-flex max-w-[210px] shrink-0 items-center gap-2.5 rounded-xl border border-line bg-surface2/60 py-1.5 pl-1.5 pr-3">
                <Logo src={r.image_url} name={r.name} size={28} />
                <span className="min-w-0 text-left">
                  <span className="block truncate text-[12.5px] font-bold leading-tight">{r.name}</span>
                  <span className="block truncate text-[10.5px] text-muted">{r.category ?? "Project"}</span>
                </span>
              </div>
            </div>
            {/* Broken explicitly rather than left to wrap: the break has to land
                after "Institutional-grade" at every width the card takes. */}
            <h2 className="mt-4 text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-[30px]">
              Institutional-grade<br />project intelligence.
            </h2>
            {/* Two lines' worth of floor on both descriptions, so the rule under
                them lands at the same height however the shorter one wraps. */}
            <p className="mt-4 min-h-[41px] text-[12.5px] leading-relaxed text-ink2">
              Go beyond token prices — fundraising, treasury, holders, developers and governance in one workspace.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line pt-3">
            {facets.map((f) => <FacetRow key={f.title} slug={r.slug} f={f} />)}
          </div>

          {/* mt-auto pins the footer to the bottom of the stretched card, so
              two cards with different row counts still end on the same line. */}
          <CardCta href={`/project/${r.slug}`}>Explore project intelligence</CardCta>
        </div>

        <div className="card flex h-full flex-col gap-6 p-5 sm:p-6">
          {/* Mirrors the intelligence card's header exactly — same eyebrow-row
              floor, same margins — so both headings, descriptions and rules sit
              on the same lines. */}
          <div>
            <div className="flex min-h-[42px] items-center">
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
