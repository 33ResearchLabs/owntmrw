"use client";

import { useState } from "react";
import Link from "next/link";
import { Eyebrow, IconBadge, MeterBar, type IconName } from "./viz";
import { Mark } from "./ui";
import { facetsFor, Picker, ExploreStrip, type Facet, type IntelProject } from "./IntelligenceCard";
import { TONE, verdictOf, trendOf, riskOf, strengthOf } from "./TradePanel";
import { WideSpark, ConnectButton, StripStat } from "./IntelligenceVariants";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";
import { fmtPct } from "@/lib/format";

/**
 * The intelligence section as a single three-column instrument: what the
 * product measures, a live snapshot of one project, and the trade panel that
 * follows from it.
 *
 * Every number on it is real. The two stats that read like marketing —
 * "7 dimensions" and the source count — are not invented for the mock: 7 is
 * `SERIES.length` in `scoreboard.ts`, the dimensions a health score is built
 * from, and 15+ is the count of files in `lib/sources/`. Both would need a
 * second look here if either of those ever changes shape.
 */

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "stack", title: "Comprehensive data",
    body: "Aggregated from on-chain and off-chain sources across seven dimensions — treasury, holders, distribution, liquidity, development, governance and momentum.",
  },
  {
    icon: "shield", title: "Fully transparent",
    body: "Every reading links back to the tab it came from, with a clear methodology behind every score.",
  },
  {
    icon: "bolt", title: "Actionable intelligence",
    body: "Live readings that help you make confident decisions, not static snapshots.",
  },
  {
    icon: "lock", title: "Built for traders",
    body: "Designed to help you discover opportunities and act on them with clarity.",
  },
];

const STATS: { value: string; label: string }[] = [
  { value: "15+", label: "Data Sources" },
  { value: "7", label: "Dimensions" },
  { value: "Live", label: "Data Updates" },
  { value: "100%", label: "Verifiable" },
];

/** Arcs drawn, not the max the box can hold before one starts clipping. */
const RING_COUNT = 5;

/**
 * The decorative flourish under the feature list: arcs sweeping outward from
 * the brand mark toward the right edge of the column. Purely atmospheric —
 * `aria-hidden` and hidden below `sm`, where the column is too narrow to give
 * it room without pushing the real content down.
 *
 * Two independent radii, `ry` and `rx`, and two different jobs. `ry` sets how
 * tall an arc stands and is capped at `cy`, so every one of them stays inside
 * the box regardless of `H` — they were three fixed numbers before (28, 46,
 * 64) inside an 80px box with `cy=40`, and the two outer ones ran to y=-6..86
 * and y=-24..104: past the box on both edges, cut there by the card's
 * `overflow-hidden`. `rx` sets how far an arc sweeps to the right and answers
 * to the column's width instead, up near `W` for the outermost — this is what
 * makes the shape read as a spiral of lines sweeping across the panel rather
 * than a small ring of circles sitting on the mark.
 */
function RingArt() {
  const W = 260, H = 76;
  const cy = H / 2;
  const maxRy = cy - 2; // 2px clearance so the tallest arc isn't tangent to the clip edge.
  const maxRx = W - 20;
  const arcs = Array.from({ length: RING_COUNT }, (_, i) => {
    const t = (i + 1) / RING_COUNT;
    return { rx: maxRx * t, ry: maxRy * t };
  });

  return (
    <div className="pointer-events-none relative mt-4 hidden w-full max-w-[260px] sm:block" style={{ height: H }} aria-hidden>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
        <defs>
          <radialGradient id="ring-fade" cx="0" cy="0.5" r="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.85" />
            <stop offset="55%" stopColor="var(--brand)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {arcs.map(({ rx, ry }) => (
          <ellipse key={ry} cx="10" cy={cy} rx={rx} ry={ry} stroke="url(#ring-fade)" strokeWidth="1.2" />
        ))}
      </svg>
      <div className="absolute left-[10px] top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Mark size={30} className="drop-shadow-[0_8px_18px_rgba(169,138,85,0.4)]" />
      </div>
    </div>
  );
}

/** One row of the snapshot list — the same five facets the shipped card reads. */
function SnapshotRow({ slug, f }: { slug: string; f: Facet }) {
  return (
    <Link
      href={`/project/${slug}#${f.tab}`}
      className="flex items-center gap-3 border-t border-grid py-2.5 text-left transition-colors duration-150 first:border-t-0 hover:bg-white/[0.02]"
    >
      <IconBadge name={f.icon} color={f.color} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{f.title}</div>
        <div className="truncate text-[10.5px] text-muted">{f.blurb}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[13.5px] font-bold leading-none">{f.value}</div>
        <div className="mt-1 text-[10px] text-faint">{f.unit}</div>
      </div>
    </Link>
  );
}

export function IntelligenceShowcase({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);
  const w = useWallet();
  const signIn = useSignIn();

  const p = projects.find((x) => x.slug === slug) ?? projects[0];
  if (!p) return null;

  const verdict = verdictOf(p.overall);
  const trend = trendOf(p.change_24h);
  const risk = riskOf(p.concentrationScore, p.liquidityScore);
  const strength = strengthOf(p.measured, p.total);
  const up = (p.change_24h ?? 0) >= 0;
  const meterColor =
    verdict.tone === "good" ? "var(--good)" : verdict.tone === "bad" ? "var(--bad)" : "var(--warn)";

  return (
    <>
    <div className="card overflow-hidden">
      {/* `grid-cols-1` is stated rather than left implicit: an implicit `auto`
          column sizes to its widest item's max-content and will not shrink
          below it, which was pushing the card past the viewport on a phone. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)_minmax(0,0.95fr)]">
        {/* ---------------------------------------------------------- methodology */}
        <div className="flex flex-col p-5 sm:p-6 lg:p-7">
          {/* 19px flat, not the 24/26px two-tone version this had: every other
              heading on the page — Market Explorer, the Explore strip, the
              intelligence card — is `text-[19px] font-extrabold` in one colour,
              and this is a section like those, not the page's hero. */}
          <Eyebrow label="Methodology" color="#9b7ae0" />
          <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
            Turn data into action.
          </h2>
          <p className="mt-0.5 max-w-[380px] text-[12.5px] leading-relaxed text-ink2">
            We transform raw on-chain and off-chain data into institutional-grade
            intelligence — so you can trade with clarity, not guesswork.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <IconBadge name={f.icon} color="#9b7ae0" size={28} />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold">{f.title}</div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{f.body}</p>
                </div>
              </div>
            ))}
          </div>

          <RingArt />
        </div>

        {/* ---------------------------------------------------------- snapshot */}
        <div className="flex flex-col border-t border-line p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[14px] font-bold tracking-tight">Intelligence snapshot</h3>
            <Picker projects={projects} selected={p} onSelect={(x) => setSlug(x.slug)} />
          </div>

          <div className="mt-1.5 flex flex-col">
            {facetsFor(p).map((f) => <SnapshotRow key={f.title} slug={p.slug} f={f} />)}
          </div>

          {/* `mt-auto` rather than a fixed top margin: the column is stretched
              to the row's full height by the grid, and the button should sit on
              its floor whether the row height is set by five facets or by a
              taller sibling column. The wrapper's `pt-4` is the floor on that —
              without it, a row this tall collapses the gap to zero. */}
          <div className="mt-auto pt-4">
            <Link
              href={`/project/${p.slug}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2/40 px-4 py-2.5 text-[12.5px] font-medium text-ink2 transition-colors duration-150 hover:border-line2 hover:bg-surface2 hover:text-ink"
            >
              Explore full project intelligence <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* ---------------------------------------------------------- trade */}
        <div className="flex flex-col border-t border-line p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7">
          <h3 className="text-[14px] font-bold tracking-tight">Ready to trade</h3>
          <p className="mt-2 text-[16.5px] font-extrabold leading-snug tracking-tight">
            {w.session
              ? <>Trade <span className="text-brand">{p.name}</span> with real-time intelligence.</>
              : "Unlock opportunities with real-time intelligence."}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink2">
            {w.session
              ? "Your wallet is connected. Every reading below is live."
              : "Connect your wallet to start trading."}
          </p>

          {!w.session && (
            <>
              <div className="mt-3.5"><ConnectButton onClick={() => signIn.open()} /></div>
              <div className="my-3 flex items-center gap-3 text-[11px] text-faint">
                <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <div className={`grid grid-cols-2 gap-3 ${w.session ? "mt-3.5" : ""}`}>
            {(["buy", "sell"] as const).map((side) => {
              const buy = side === "buy";
              return (
                <Link
                  key={side}
                  href={`/project/${p.slug}#trade`}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[13.5px] font-bold transition-colors duration-150 ${
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

          <div className="mt-3.5 rounded-xl border border-line bg-page/40 p-3.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate text-[11.5px] font-medium text-ink2">
                {p.symbol ? `${p.symbol} · ` : ""}{p.name}
              </span>
              <span className="shrink-0 rounded-md bg-surface2 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
                Market view
              </span>
            </div>

            <div className="mt-2 flex items-end justify-between gap-4">
              <div className={`text-[22px] font-extrabold leading-none tracking-tight ${TONE[verdict.tone]}`}>
                {verdict.label}
              </div>
              <div className="w-[100px] shrink-0"><WideSpark points={p.spark} tone={up ? "good" : "bad"} height={26} /></div>
            </div>

            <div className="mt-2">
              <div className="text-[10px] text-muted">Health {p.overall ?? "—"}/100</div>
              <div className="mt-1"><MeterBar pct={p.overall} color={meterColor} /></div>
            </div>

            <div className="mt-2.5 flex divide-x divide-line border-t border-line pt-2.5">
              <div className="min-w-0 flex-1"><StripStat label="Trend" r={trend} /></div>
              <div className="min-w-0 flex-1"><StripStat label="Risk Level" r={risk} /></div>
              <div className="min-w-0 flex-1"><StripStat label="Data Strength" r={strength} /></div>
            </div>

            {p.change_24h != null && (
              <div className="mt-2.5 text-center text-[10px] text-faint">
                Trend (24h): {fmtPct(p.change_24h)} · Risk: holder spread &amp; pool depth
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 divide-y divide-line border-t border-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {STATS.map((s) => (
          <div key={s.label} className="px-5 py-3 text-center">
            <div className="num text-[17px] font-extrabold tracking-tight">{s.value}</div>
            <div className="mt-0.5 text-[10px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* -------------------------------------------------------------- footer */}
      <div className="flex flex-col gap-2 border-t border-line px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="flex min-w-0 items-center gap-2 text-[11px] leading-relaxed text-muted">
          <span className="shrink-0 text-muted" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5 4.5 6.8v4.9c0 4.4 3.1 7.6 7.5 8.8 4.4-1.2 7.5-4.4 7.5-8.8V6.8Z" />
              <path d="M12 9v4" /><path d="M12 16h.01" />
            </svg>
          </span>
          Underly is a data intelligence platform, not an investment advisor.
        </p>
        <Link
          href={`/project/${p.slug}#overview`}
          className="shrink-0 text-[11.5px] font-medium text-ink2 transition-colors duration-150 hover:text-brand"
        >
          Learn more about our methodology →
        </Link>
      </div>
    </div>

    <ExploreStrip project={p} />
    </>
  );
}
