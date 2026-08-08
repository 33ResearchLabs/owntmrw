"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "./ui";
import { Eyebrow, Icon, IconBadge } from "./viz";
import { fmtPct } from "@/lib/format";
import { facetsFor, Picker, type Facet, type IntelProject } from "./IntelligenceCard";
import { TONE, verdictOf, trendOf, riskOf, strengthOf, type Reading } from "./TradePanel";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";

/**
 * Alternate layouts A, B and C for the intelligence pair, plus the pieces every
 * layout shares. D, E and F are in `IntelligenceVariantsMore`, which imports
 * those pieces from here.
 *
 * Nothing in either file computes a reading. The five facets come from
 * `facetsFor` and the four readings from the four banding functions in
 * `TradePanel`, both imported rather than restated, so a project cannot come
 * out HOLD in one layout and BUY in the next. What varies across the six is
 * only where those figures sit and how much chrome they carry.
 *
 * None of this is wired into the page. `IntelligenceSection` still renders the
 * shipped pair; these are rendered one under the other at `/design/intelligence`,
 * and whichever one wins gets folded back into the real components.
 */

/** Every reading the trade side of a layout shows, derived once per project. */
export function readingsFor(p: IntelProject) {
  return {
    verdict: verdictOf(p.overall),
    trend: trendOf(p.change_24h),
    risk: riskOf(p.concentrationScore, p.liquidityScore),
    strength: strengthOf(p.measured, p.total),
    up: (p.change_24h ?? 0) >= 0,
  };
}

/**
 * The price line at panel width rather than at the shipped 172px.
 *
 * A wash under the line and no endpoint dot: at this width the shape is the
 * subject rather than a detail beside the verdict, and the dot reads as a data
 * point the reader is meant to be able to hit.
 */
export function WideSpark({ points, tone, height = 54 }: { points: number[]; tone: "good" | "bad"; height?: number }) {
  if (points.length < 3) return null;
  const W = 300, PAD = 4;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const y = (v: number) => PAD + (height - PAD * 2) * (1 - (v - min) / span);
  const line = points.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const stroke = tone === "good" ? "var(--good)" : "var(--bad)";
  // Keyed on tone alone, which is all the stops depend on — so the id is the
  // same on the server and the client, and two panels of the same tone share
  // one definition rather than colliding on it.
  const gid = `vspark-${tone}`;

  return (
    <svg
      width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none"
      role="img" aria-label={`Price over the last ${points.length} days`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${height} L0 ${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** The health score as a dial. Used by variant C, where it is the lede. */
export function ScoreArc({ value, color, size = 92 }: { value: number | null; color: string; size?: number }) {
  const R = 36;
  const len = Math.PI * R;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const track = "M8 44 A36 36 0 0 1 80 44";

  return (
    <svg width={size} height={size * 0.565} viewBox="0 0 88 50" role="img"
      aria-label={value == null ? "Health score not available" : `Health score ${value} out of 100`}>
      <path d={track} fill="none" stroke="var(--grid)" strokeWidth="7" strokeLinecap="round" />
      {value != null && (
        <path d={track} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(len * pct).toFixed(1)} ${len.toFixed(1)}`} />
      )}
      <text x="44" y="42" textAnchor="middle" fill="var(--ink)"
        fontSize="20" fontWeight="800" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value ?? "—"}
      </text>
    </svg>
  );
}

/** The connect button, unchanged from the shipped panel — every layout keeps it. */
export function ConnectButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[14px] font-bold text-brandink transition-[filter] duration-150 hover:brightness-[1.08] active:brightness-95"
      style={{
        background: "linear-gradient(180deg, var(--brand-hi) 0%, var(--brand) 100%)",
        boxShadow: "0 8px 22px -10px rgba(169, 138, 85, 0.9), inset 0 1px 0 0 rgba(255, 255, 255, 0.22)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" />
        <path d="M3 8.5h14.5" /><path d="M16.5 13.5h.01" />
      </svg>
      Connect wallet
    </button>
  );
}

/** The footer link every layout ends on, in the shipped shape. */
export function CardCta({ href, icon, children }: { href: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2/40 px-4 py-3.5 text-[13px] font-medium text-ink2 transition-colors duration-150 hover:border-line2 hover:bg-surface2 hover:text-ink"
    >
      {icon}{children} <span aria-hidden>→</span>
    </Link>
  );
}

export const METHODOLOGY_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
  </svg>
);

/* ============================================================== variant A
 *
 * Terminal readout.
 *
 * The shipped card nests a bordered box per row inside a bordered card, which
 * is two frames around every figure. Here the frames come off: rows are a
 * hairline-ruled ledger with a colour rail instead of a tinted badge, the
 * figures step up to 15px and set in tabular numerals, and the labels drop to
 * uppercase micro-type. The right panel leads with the verdict at 46px over a
 * full-width price line, so the stance is the first thing read rather than the
 * fourth. Densest of the three.
 */

function LedgerRow({ slug, f }: { slug: string; f: Facet }) {
  return (
    <Link
      href={`/project/${slug}#${f.tab}`}
      className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-white/[0.025]"
    >
      <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: f.color }} aria-hidden />
      <span className="shrink-0" style={{ color: f.color }} aria-hidden><Icon name={f.icon} size={15} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">{f.title}</div>
        <div className="truncate text-[12px] text-ink2">{f.blurb}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[15px] font-bold leading-tight">{f.value}</div>
        <div className="text-[10px] uppercase tracking-[0.06em] text-faint">{f.unit}</div>
      </div>
    </Link>
  );
}

function LedgerCard({
  projects, selected, onSelect,
}: { projects: IntelProject[]; selected: IntelProject; onSelect: (p: IntelProject) => void }) {
  return (
    <div className="card flex h-full flex-col gap-5 p-5 sm:p-6">
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

      <div className="flex flex-col divide-y divide-grid border-t border-grid">
        {facetsFor(selected).map((f) => <LedgerRow key={f.title} slug={selected.slug} f={f} />)}
      </div>

      <CardCta href={`/project/${selected.slug}`}>Explore project intelligence</CardCta>
    </div>
  );
}

/** One reading in the ruled strip under the verdict. */
export function StripStat({ label, r }: { label: string; r: Reading }) {
  return (
    <div className="min-w-0 px-3 text-center first:pl-0 last:pr-0">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className={`mt-1 text-[13.5px] font-bold ${TONE[r.tone]}`}>{r.label}</div>
    </div>
  );
}

function TerminalTradePanel({ p }: { p: IntelProject }) {
  const w = useWallet();
  const signIn = useSignIn();
  const { verdict, trend, risk, strength, up } = readingsFor(p);

  return (
    <div className="card flex h-full flex-col gap-5 p-5 sm:p-6">
      <div>
        <Eyebrow label="Methodology" color="#9b7ae0" />
        <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">Turn data into action.</h2>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
          Use data-backed insights to trade with clarity, not guesswork.
        </p>
      </div>

      {/* The instrument line: which thing the readings below are about, set
          like a ticker rather than like a caption. */}
      <div className="flex items-center justify-between gap-3 border-y border-grid py-2.5">
        <span className="num min-w-0 truncate text-[12px] font-semibold tracking-[0.03em] text-ink2">
          {p.symbol ? `${p.symbol} · ` : ""}{p.name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          {w.session ? "Live" : "Ready to trade"}
          <span className="h-1.5 w-1.5 rounded-full bg-good pulse" />
        </span>
      </div>

      <div>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Market view</div>
            <div className={`mt-1 text-[46px] font-extrabold leading-[0.85] tracking-tight ${TONE[verdict.tone]}`}>
              {verdict.label}
            </div>
          </div>
          {p.change_24h != null && (
            <div className="shrink-0 text-right">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">24h</div>
              <div className={`num mt-1 text-[16px] font-bold ${up ? "text-good" : "text-bad"}`}>
                {fmtPct(p.change_24h)}
              </div>
            </div>
          )}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{verdict.note}</p>
        <div className="mt-3"><WideSpark points={p.spark} tone={up ? "good" : "bad"} /></div>
      </div>

      <div className="flex divide-x divide-grid border-y border-grid py-2.5">
        <div className="min-w-0 flex-1"><StripStat label="Trend" r={trend} /></div>
        <div className="min-w-0 flex-1"><StripStat label="Risk" r={risk} /></div>
        <div className="min-w-0 flex-1"><StripStat label="Data" r={strength} /></div>
      </div>

      {!w.session && <ConnectButton onClick={() => signIn.open()} />}

      {/*
       * Buy and Sell as one segmented control rather than two cards with a gap
       * between them: they are two sides of a single decision, and the gap in
       * the shipped panel reads as two unrelated buttons that happen to sit
       * together. `gap-px` over a `bg-line` fill is the hairline between them.
       */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {(["buy", "sell"] as const).map((side) => {
          const buy = side === "buy";
          return (
            <Link
              key={side}
              href={`/project/${p.slug}#trade`}
              className={`flex items-center justify-center gap-2.5 py-3.5 transition-colors duration-150 ${
                buy ? "bg-good/10 hover:bg-good/20" : "bg-bad/10 hover:bg-bad/20"
              }`}
            >
              <span className={`text-[15px] font-bold ${buy ? "text-good" : "text-bad"}`} aria-hidden>
                {buy ? "↑" : "↓"}
              </span>
              <span className="text-[14.5px] font-bold">{buy ? "Buy" : "Sell"}</span>
              <span className="text-[11.5px] text-muted">{buy ? "long" : "short"}</span>
            </Link>
          );
        })}
      </div>

      <CardCta href={`/project/${p.slug}#overview`} icon={METHODOLOGY_ICON}>View methodology</CardCta>
    </div>
  );
}

export function VariantTerminal({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);
  const selected = projects.find((p) => p.slug === slug) ?? projects[0];
  if (!selected) return null;

  return (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
      <LedgerCard projects={projects} selected={selected} onSelect={(p) => setSlug(p.slug)} />
      <TerminalTradePanel p={selected} />
    </div>
  );
}

/* ============================================================== variant B
 *
 * One instrument.
 *
 * The two cards become one. Two headings and two borders is the section
 * claiming to be two things, when both halves are readings on the same project
 * — so there is a single header, a single frame, and the split moves inside as
 * a hairline column rule. The verdict is promoted into the header beside the
 * picker, which is what lets the right rail drop straight to the actions. The
 * facets become tiles, two across, so the figures get their own line at 19px
 * instead of competing with the blurb across a row.
 */

function FacetTile({ slug, f, wide }: { slug: string; f: Facet; wide?: boolean }) {
  const shell =
    "rounded-xl border border-line bg-surface2/40 p-3.5 transition-colors duration-150 hover:border-line2 hover:bg-surface2";

  // Five tiles do not divide into two columns, so the last one takes the whole
  // row — and turns on its side while it does. A stacked tile stretched to
  // double width leaves its figure marooned against the left edge with the
  // whole right half empty; laid out as a row it fills what it was given.
  if (wide) {
    return (
      <Link href={`/project/${slug}#${f.tab}`} className={`${shell} flex items-center gap-3 sm:col-span-2`}>
        <IconBadge name={f.icon} color={f.color} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] font-semibold text-ink2">{f.title}</div>
          <div className="truncate text-[10.5px] text-muted">{f.blurb}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[19px] font-bold leading-none">{f.value}</div>
          <div className="mt-1 text-[10.5px] text-muted">{f.unit}</div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/project/${slug}#${f.tab}`} className={`${shell} flex flex-col gap-2.5`}>
      <div className="flex min-w-0 items-center gap-2">
        <IconBadge name={f.icon} color={f.color} size={26} />
        <span className="truncate text-[11.5px] font-semibold text-ink2">{f.title}</span>
      </div>
      <div className="num text-[19px] font-bold leading-none">{f.value}</div>
      <div className="text-[10.5px] text-muted">{f.unit}</div>
    </Link>
  );
}

export function VariantUnified({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);
  const w = useWallet();
  const signIn = useSignIn();

  const p = projects.find((x) => x.slug === slug) ?? projects[0];
  if (!p) return null;

  const { verdict, trend, risk, strength, up } = readingsFor(p);
  const facets = facetsFor(p);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <Eyebrow label="Project Intelligence" color="var(--brand)" />
          <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
            Institutional-grade project intelligence.
          </h2>
          <p className="mt-0.5 max-w-[560px] text-[12.5px] leading-relaxed text-ink2">
            Go beyond token prices — fundraising, treasury, holders, developers and governance in one workspace.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* The stance, in the header. Every figure under it is evidence for
              this line, so it goes above them rather than at the end. */}
          <span className="hidden items-center gap-2 rounded-xl border border-line bg-surface2/60 px-3 py-1.5 sm:inline-flex">
            <span className={`text-[13px] font-extrabold ${TONE[verdict.tone]}`}>{verdict.label}</span>
            <span className="text-[11px] text-muted">
              {p.overall != null ? `${p.overall}/100` : "unscored"}
            </span>
          </span>
          <Picker projects={projects} selected={p} onSelect={(x) => setSlug(x.slug)} />
        </div>
      </div>

      <div className="grid gap-6 border-t border-line p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-0 lg:p-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:p-6">
          {facets.map((f, i) => (
            <FacetTile key={f.title} slug={p.slug} f={f} wide={i === facets.length - 1} />
          ))}
        </div>

        {/* The rule between the halves rather than a gap: inside one frame a
            gap reads as two cards again. */}
        <div className="flex flex-col gap-4 border-line lg:border-l lg:p-6">
          <div>
            <Eyebrow label="Methodology" color="#9b7ae0" />
            <h3 className="mt-1 text-[15px] font-bold tracking-tight">Turn data into action.</h3>
          </div>

          {/*
           * The verdict, its note and the line stack rather than sit beside
           * each other. This rail is 380px at most, and a spark set next to the
           * note squeezed that sentence into four ragged lines for the sake of
           * a chart 100px wide.
           */}
          <div className="rounded-xl border border-line bg-page/40 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className={`text-[30px] font-extrabold leading-none tracking-tight ${TONE[verdict.tone]}`}>
                {verdict.label}
              </div>
              {p.change_24h != null && (
                <span className={`num shrink-0 text-[13px] font-bold ${up ? "text-good" : "text-bad"}`}>
                  {fmtPct(p.change_24h)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{verdict.note}</p>
            <div className="mt-2.5"><WideSpark points={p.spark} tone={up ? "good" : "bad"} height={40} /></div>

            <div className="mt-3 flex divide-x divide-line border-t border-line pt-3">
              <div className="min-w-0 flex-1"><StripStat label="Trend" r={trend} /></div>
              <div className="min-w-0 flex-1"><StripStat label="Risk" r={risk} /></div>
              <div className="min-w-0 flex-1"><StripStat label="Data" r={strength} /></div>
            </div>
          </div>

          {!w.session && <ConnectButton onClick={() => signIn.open()} />}

          <div className="grid grid-cols-2 gap-3">
            {(["buy", "sell"] as const).map((side) => {
              const buy = side === "buy";
              return (
                <Link
                  key={side}
                  href={`/project/${p.slug}#trade`}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-[14px] font-bold transition-colors duration-150 ${
                    buy
                      ? "border-good/30 bg-good/10 text-good hover:border-good/50 hover:bg-good/15"
                      : "border-bad/30 bg-bad/10 text-bad hover:border-bad/50 hover:bg-bad/15"
                  }`}
                >
                  <span aria-hidden>{buy ? "↑" : "↓"}</span>{buy ? "Buy" : "Sell"}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* One footer for the whole instrument, split by the same rule the body
          uses, so both destinations sit on the card's own bottom edge. */}
      <div className="grid divide-line border-t border-line sm:grid-cols-2 sm:divide-x">
        <Link
          href={`/project/${p.slug}`}
          className="flex items-center justify-center gap-2 px-4 py-3.5 text-[13px] font-medium text-ink2 transition-colors duration-150 hover:bg-surface2 hover:text-ink"
        >
          Explore project intelligence <span aria-hidden>→</span>
        </Link>
        <Link
          href={`/project/${p.slug}#overview`}
          className="flex items-center justify-center gap-2 border-t border-line px-4 py-3.5 text-[13px] font-medium text-ink2 transition-colors duration-150 hover:bg-surface2 hover:text-ink sm:border-t-0"
        >
          {METHODOLOGY_ICON} View methodology <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}

/* ============================================================== variant C
 *
 * Dossier.
 *
 * Three full-width bands instead of two columns. The project is named once, in
 * a masthead that carries the logo, the picker and the score as a dial — so
 * neither band below has to re-establish which project it is about, which is
 * what buys the room for the five facets to sit in a single row rather than
 * stacked. The trade band is last because it is what the two bands above argue
 * for. Widest and most editorial of the three, and the one that reads best on
 * a phone, since bands stack where columns squeeze.
 */

function DossierMasthead({
  projects, selected, onSelect,
}: { projects: IntelProject[]; selected: IntelProject; onSelect: (p: IntelProject) => void }) {
  const { verdict, up } = readingsFor(selected);
  const arcColor =
    verdict.tone === "good" ? "var(--good)" : verdict.tone === "bad" ? "var(--bad)" : "var(--warn)";

  return (
    <div className="card flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="min-w-0">
        <Eyebrow label="Project Intelligence" color="var(--brand)" />
        <div className="mt-2.5 flex min-w-0 items-center gap-3.5">
          <Logo src={selected.image_url} name={selected.name} size={46} />
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-extrabold leading-tight tracking-tight">
              {selected.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
              {selected.symbol && (
                <span className="num rounded-md bg-surface2 px-1.5 py-0.5 font-semibold text-ink2">
                  {selected.symbol}
                </span>
              )}
              <span>{selected.category ?? "Project"}</span>
              {selected.change_24h != null && (
                <span className={`num font-semibold ${up ? "text-good" : "text-bad"}`}>
                  {fmtPct(selected.change_24h)} · 24h
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 max-w-[520px] text-[12.5px] leading-relaxed text-ink2">
          Go beyond token prices — fundraising, treasury, holders, developers and governance in one workspace.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-5 lg:justify-end">
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface2/30 px-4 py-3">
          <ScoreArc value={selected.overall} color={arcColor} />
          <div className="min-w-0">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Market view</div>
            <div className={`text-[24px] font-extrabold leading-tight tracking-tight ${TONE[verdict.tone]}`}>
              {verdict.label}
            </div>
            <div className="text-[11px] text-muted">
              {selected.measured}/{selected.total} dimensions measured
            </div>
          </div>
        </div>
        <Picker projects={projects} selected={selected} onSelect={onSelect} />
      </div>
    </div>
  );
}

function DossierStrip({ p }: { p: IntelProject }) {
  return (
    <div className="card overflow-hidden">
      {/*
       * Five cells flush against each other, ruled rather than gapped. The
       * divide flips axis at `sm`: stacked they need a rule between rows, in a
       * row they need one between columns, and leaving both on would draw a
       * grid over what is meant to be a single strip.
       */}
      <div className="grid grid-cols-1 divide-y divide-grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {facetsFor(p).map((f) => (
          <Link
            key={f.title}
            href={`/project/${p.slug}#${f.tab}`}
            className="group flex min-w-0 items-center gap-3 px-4 py-4 transition-colors duration-150 hover:bg-surface2/60 sm:flex-col sm:items-start sm:gap-2.5"
          >
            <IconBadge name={f.icon} color={f.color} size={30} />
            <div className="min-w-0 flex-1 sm:flex-none">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {f.title}
              </div>
              <div className="num mt-1 text-[18px] font-bold leading-none">{f.value}</div>
              <div className="mt-1 truncate text-[10.5px] text-faint">{f.unit}</div>
            </div>
          </Link>
        ))}
      </div>
      <Link
        href={`/project/${p.slug}`}
        className="flex items-center justify-center gap-2 border-t border-line px-4 py-3 text-[12.5px] font-medium text-ink2 transition-colors duration-150 hover:bg-surface2 hover:text-ink"
      >
        Explore all project intelligence <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function DossierTradeBand({ p }: { p: IntelProject }) {
  const w = useWallet();
  const signIn = useSignIn();
  const { verdict, trend, risk, strength, up } = readingsFor(p);

  return (
    <div className="card p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <Eyebrow label="Methodology" color="#9b7ae0" />
          <h3 className="mt-1 text-[19px] font-extrabold tracking-tight">Turn data into action.</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
            {w.session
              ? "Your wallet is connected. Every reading below is live."
              : "Use data-backed insights to trade with clarity, not guesswork."}
          </p>

          {/* The three readings as chips on the copy side, so the action side
              stays only the action. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {([["Trend", trend], ["Risk level", risk], ["Data strength", strength]] as const).map(([label, r]) => (
              <span key={label}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface2/40 px-3 py-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.08em] text-faint">{label}</span>
                <span className={`text-[12.5px] font-bold ${TONE[r.tone]}`}>{r.label}</span>
              </span>
            ))}
          </div>

          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            {verdict.note}
            {p.change_24h != null && ` · trend from the last 24h (${fmtPct(p.change_24h)})`}
            {" · risk from holder spread and pool depth"}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* The spark takes a fixed width rather than `flex-1`: at 100% it ate
              the row and truncated the instrument name it is labelled by. */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-page/40 px-4 py-3">
            <span className="num min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink2">
              {p.symbol ? `${p.symbol} · ` : ""}{p.name}
            </span>
            <div className="w-[150px] shrink-0">
              <WideSpark points={p.spark} tone={up ? "good" : "bad"} height={30} />
            </div>
          </div>

          {!w.session && <ConnectButton onClick={() => signIn.open()} />}

          <div className="grid grid-cols-2 gap-3">
            {(["buy", "sell"] as const).map((side) => {
              const buy = side === "buy";
              return (
                <Link
                  key={side}
                  href={`/project/${p.slug}#trade`}
                  className={`flex items-center justify-center gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-150 ${
                    buy
                      ? "border-good/30 bg-good/10 hover:border-good/50 hover:bg-good/15"
                      : "border-bad/30 bg-bad/10 hover:border-bad/50 hover:bg-bad/15"
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
                    buy ? "bg-good/20 text-good" : "bg-bad/20 text-bad"
                  }`} aria-hidden>
                    {buy ? "↑" : "↓"}
                  </span>
                  <span className="text-left">
                    <span className="block text-[14.5px] font-bold">{buy ? "Buy" : "Sell"}</span>
                    <span className="block text-[11px] text-muted">{buy ? "Go long" : "Go short"}</span>
                  </span>
                </Link>
              );
            })}
          </div>

          <Link
            href={`/project/${p.slug}#overview`}
            className="flex items-center justify-center gap-2 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:text-ink"
          >
            {METHODOLOGY_ICON} View methodology <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function VariantDossier({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);
  const selected = projects.find((p) => p.slug === slug) ?? projects[0];
  if (!selected) return null;

  return (
    <div className="space-y-6">
      <DossierMasthead projects={projects} selected={selected} onSelect={(p) => setSlug(p.slug)} />
      <DossierStrip p={selected} />
      <DossierTradeBand p={selected} />
    </div>
  );
}
