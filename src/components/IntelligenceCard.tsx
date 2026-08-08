"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "./ui";
import { IconBadge, Eyebrow, type IconName } from "./viz";
import { TradePanel } from "./TradePanel";
import { fmtUsd, fmtNum, fmtPct, timeAgo } from "@/lib/format";

/**
 * The intelligence card: one project's five headline figures, with a picker
 * for which project that is.
 *
 * This is the client half of `IntelligenceSection`. It is split out rather than
 * marking the whole section `"use client"` because the methodology card and the
 * trust strip beside it are static copy — only the picker and the figures that
 * follow it need state, so only they cross into the bundle.
 *
 * Every figure is a real reading, the same one the project's own page shows,
 * and each row deep-links to the tab it came from.
 */

/**
 * What the card reads, flattened at the server boundary. A `ScreenerRow`
 * carries thirty-odd fields this never touches, and every one of them would be
 * serialised into the page for every project in the picker.
 */
export interface IntelProject {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  image_url: string | null;
  raise_amount_usd: number | null;
  treasury_usd: number | null;
  holder_count: number | null;
  gh_last_push: number | null;
  roi_since_raise: number | null;
  /** 24h price move, in percent. Drives the trend reading. */
  change_24h: number | null;
  /** Health score out of 100, and how much of it could be measured. */
  overall: number | null;
  measured: number;
  total: number;
  /**
   * The two dimension scores the risk reading is built from — how spread the
   * holders are, and how deep the pool is. Null where the dimension could not
   * be measured, which is different from scoring zero on it.
   */
  concentrationScore: number | null;
  liquidityScore: number | null;
  /** Recent daily closes, oldest first, for the line on the trade panel. */
  spark: number[];
}

/** One row of the card: a measure, and where to read more of it. */
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

const dash = <span className="text-muted">—</span>;

function facetsFor(p: IntelProject): Facet[] {
  // Treasury against what was raised — the card's one derived figure, and it
  // only appears when both halves are real and the raise was non-zero.
  const remaining =
    p.treasury_usd != null && p.raise_amount_usd
      ? (p.treasury_usd / p.raise_amount_usd) * 100
      : null;

  return [
    {
      icon: "token", color: "var(--accent)", tab: "overview",
      title: "Raise Overview", blurb: "Funding details and round information",
      value: p.raise_amount_usd != null ? fmtUsd(p.raise_amount_usd) : dash, unit: "Raised",
    },
    {
      icon: "bank", color: "var(--good)", tab: "treasury",
      title: "Treasury", blurb: "On-chain treasury and capital allocation",
      value: p.treasury_usd != null ? fmtUsd(p.treasury_usd) : dash,
      unit: remaining != null ? `${remaining.toFixed(0)}% of raise held` : "on-chain balance",
    },
    {
      icon: "users", color: "#9b7ae0", tab: "holders",
      title: "Holders", blurb: "Holder distribution and concentration",
      value: p.holder_count != null ? fmtNum(p.holder_count) : dash, unit: "Total holders",
    },
    {
      icon: "bars", color: "#e08a3c", tab: "development",
      title: "Development", blurb: "GitHub activity and developer performance",
      value: p.gh_last_push ? timeAgo(p.gh_last_push) : dash, unit: "Last commit",
    },
    {
      icon: "chart", color: "var(--warn)", tab: "overview",
      title: "Performance", blurb: "Market performance since launch",
      value: p.roi_since_raise != null
        ? <span className={p.roi_since_raise >= 0 ? "text-good" : "text-bad"}>{fmtPct(p.roi_since_raise)}</span>
        : dash,
      unit: "ROI since raise",
    },
  ];
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" aria-hidden
      className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-200 ${open ? "-rotate-180" : ""}`}
    >
      <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The project picker.
 *
 * Keeps the chip it replaces exactly as it looked and adds a chevron, so the
 * control reads as the same object having gained an affordance rather than as a
 * new widget. Dismissal follows `GlobalSearch`: a document `mousedown` outside
 * the box, or Escape.
 */
function Picker({
  projects,
  selected,
  onSelect,
}: {
  projects: IntelProject[];
  selected: IntelProject;
  onSelect: (p: IntelProject) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Only one project on file: the control has nothing to offer, so it stays the
  // plain chip it was rather than a dropdown that opens onto a single choice.
  const single = projects.length < 2;

  const chip = (
    <>
      <Logo src={selected.image_url} name={selected.name} size={24} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[11.5px] font-bold leading-tight">{selected.name}</span>
        <span className="block truncate text-[10px] leading-tight text-muted">{selected.category ?? "Project"}</span>
      </span>
    </>
  );

  if (single) {
    return (
      <div className="inline-flex min-w-0 max-w-[196px] items-center gap-2 rounded-xl border border-line bg-surface2/60 py-1 pl-1 pr-2.5">
        {chip}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Project shown: ${selected.name}. Choose another`}
        className={`inline-flex w-full min-w-0 max-w-[196px] items-center gap-2 rounded-xl border bg-surface2/60 py-1 pl-1 pr-2 transition-colors duration-150 hover:border-line2 hover:bg-surface2 ${
          open ? "border-line2" : "border-line"
        }`}
      >
        {chip}
        <Chevron open={open} />
      </button>

      {open && (
        /*
         * Right-aligned and narrower than the card so it cannot reach past the
         * edge on a phone, and capped in height because the list is every
         * tracked project — it scrolls rather than running off the section.
         */
        <div
          className="absolute right-0 top-full z-50 mt-2 max-h-[320px] w-[264px] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface py-1 shadow-2xl"
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
          }}
        >
          {projects.map((p) => {
            const on = p.slug === selected.slug;
            return (
              <button
                key={p.slug}
                type="button"
                aria-current={on || undefined}
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors duration-100 hover:bg-white/6 ${
                  on ? "bg-white/5" : ""
                }`}
              >
                <Logo src={p.image_url} name={p.name} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold leading-tight">{p.name}</span>
                  <span className="block truncate text-[10.5px] text-muted">{p.category ?? "Project"}</span>
                </span>
                {on && <span className="shrink-0 text-[12px] text-brand" aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The pair of cards, and the selection they share.
 *
 * State lives here rather than in the left card because the trade panel beside
 * it reads the same project — picking a token has to move both, and two
 * components cannot each own the answer. They are returned as a fragment so
 * the section's grid still sees two children and lays them out as two columns.
 */
export function IntelligencePair({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);

  // Selection is held as a slug rather than the object, so a refreshed list
  // with new readings on it does not leave a stale snapshot on screen.
  const selected = projects.find((p) => p.slug === slug) ?? projects[0];
  if (!selected) return null;

  return (
    <>
      <IntelligenceCard
        projects={projects}
        selected={selected}
        onSelect={(p) => setSlug(p.slug)}
      />
      <TradePanel p={selected} />
    </>
  );
}

function IntelligenceCard({
  projects,
  selected,
  onSelect,
}: {
  projects: IntelProject[];
  selected: IntelProject;
  onSelect: (p: IntelProject) => void;
}) {
  return (
    <div className="card flex h-full flex-col gap-6 p-5 sm:p-6">
      {/*
       * Same shape as `TrendSectionHeader`, which every other section on the
       * page uses: eyebrow, a 19px title and the subtitle, with whatever action
       * the section carries set beside them rather than above. Written out here
       * only because that component takes a plain string title and this one has
       * to keep the picker's own state wiring.
       *
       * The picker sitting in the row rather than over it is what dropped this
       * header's height: it no longer pushes the heading down, so the two cards'
       * titles line up without a floor holding them level.
       */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <Eyebrow label="Project Intelligence" color="var(--brand)" />
          <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
            Institutional-grade project intelligence.
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
            Go beyond token prices — fundraising, treasury, holders, developers and governance in one workspace.
          </p>
        </div>
        <Picker projects={projects} selected={selected} onSelect={onSelect} />
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-3">
        {facetsFor(selected).map((f) => <FacetRow key={f.title} slug={selected.slug} f={f} />)}
      </div>

      {/* mt-auto pins the footer to the bottom of the stretched card, so
          two cards with different row counts still end on the same line. */}
      <CardCta href={`/project/${selected.slug}`}>Explore project intelligence</CardCta>
    </div>
  );
}
