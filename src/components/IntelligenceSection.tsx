import Link from "next/link";
import type { ScreenerRow } from "@/lib/queries";
import { Logo } from "./ui";
import { IconBadge, TrendSectionHeader, type IconName } from "./viz";
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

function FacetRow({ slug, f }: { slug: string; f: Facet }) {
  return (
    <Link
      href={`/project/${slug}#${f.tab}`}
      className="flex items-center gap-3 border-t border-grid px-4 py-3 transition-colors first:border-t-0 hover:bg-surface2/40"
    >
      <IconBadge name={f.icon} color={f.color} size={32} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{f.title}</div>
        <div className="truncate text-[11.5px] text-muted">{f.blurb}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[13.5px] font-semibold">{f.value}</div>
        <div className="text-[10.5px] text-muted">{f.unit}</div>
      </div>
      <span className="shrink-0 text-[13px] text-faint" aria-hidden>›</span>
    </Link>
  );
}

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
    <section className="grid items-stretch gap-6 lg:grid-cols-2">
      <div className="card flex h-full flex-col overflow-hidden">
        <div className="px-5 pt-5">
          <TrendSectionHeader
            eyebrow="Project Intelligence"
            color="var(--accent)"
            title="Institutional-grade project intelligence."
            subtitle="Go beyond token prices — fundraising, treasury, holders, developers and governance in one workspace."
            divider
          />
        </div>
        <div>
          <div className="flex items-center gap-3 border-y border-grid px-4 py-3.5">
            <Logo src={r.image_url} name={r.name} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold">{r.name}</div>
              <div className="truncate text-[11.5px] text-muted">{r.category ?? "Project"}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10.5px] text-muted">Last updated</div>
              <div className="text-[11.5px] text-ink2">{timeAgo(r.updated_ts)}</div>
            </div>
          </div>
        </div>
        {facets.map((f) => <FacetRow key={f.title} slug={r.slug} f={f} />)}
        {/* mt-auto pins the footer to the bottom of the stretched card, so
            two cards with different row counts still end on the same line. */}
        <Link
          href={`/project/${r.slug}`}
          className="mt-auto flex items-center justify-center gap-2 border-t border-grid px-4 py-3.5 text-[13px] font-medium text-accent hover:underline"
        >
          Explore project intelligence <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="card flex h-full flex-col overflow-hidden">
        <div className="px-5 pt-5">
          <TrendSectionHeader
            eyebrow="Methodology"
            color="#9b7ae0"
            title="Transparent research methodology."
            subtitle="Every figure is read from public sources, and every gap is named rather than filled."
            divider
          />
        </div>
        {METHOD.map((m) => (
          <div key={m.title} className="flex items-center gap-3 border-t border-grid px-4 py-3 first:border-t-0">
            <IconBadge name={m.icon} color={m.color} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{m.title}</div>
              <div className="truncate text-[11.5px] text-muted">{m.blurb}</div>
            </div>
            <Check />
          </div>
        ))}
        <Link
          href="/screener"
          className="mt-auto flex items-center justify-center gap-2 border-t border-grid px-4 py-3.5 text-[13px] font-medium text-accent hover:underline"
        >
          See it applied across every project <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
