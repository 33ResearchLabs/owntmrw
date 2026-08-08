"use client";

import Link from "next/link";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";
import { Eyebrow } from "./viz";
import { fmtPct } from "@/lib/format";
import type { IntelProject } from "./IntelligenceCard";

/**
 * The trade panel: what the selected project's readings amount to, and the way
 * in to acting on them.
 *
 * Every figure on it is derived from data already on the page — the health
 * score, its dimension scores, the 24h move and the daily closes. Nothing here
 * is a forecast: the verdict restates the score against the same thresholds
 * the research section reads it by, and each reading below names the measure it
 * came from rather than a judgement about where the price is going.
 */

/*
 * The four readings below and the tone map are exported because the alternate
 * layouts in `IntelligenceVariants` restate the same panel in different shapes.
 * A layout may move where the verdict sits; it may not decide what the verdict
 * is — that stays here, so a project cannot come out HOLD in one design and BUY
 * in another.
 */
export type Tone = "good" | "warn" | "bad" | "muted";

export const TONE: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  muted: "text-muted",
};

export interface Reading { label: string; tone: Tone }

/**
 * The score, restated as a stance.
 *
 * The 70/40 cuts are the ones `ResearchSection` already calls Strong/Moderate/
 * Weak, reused rather than invented so the same project cannot be "Strong" in
 * one section and a different band in the next.
 */
export function verdictOf(overall: number | null): Reading & { note: string } {
  if (overall == null) return { label: "NO READING", tone: "muted", note: "not enough measured to score" };
  if (overall >= 70) return { label: "BUY", tone: "good", note: `Health ${overall}/100 — strong across measured dimensions` };
  if (overall >= 40) return { label: "HOLD", tone: "warn", note: `Health ${overall}/100 — mixed across measured dimensions` };
  return { label: "CAUTION", tone: "bad", note: `Health ${overall}/100 — weak across measured dimensions` };
}

/** The 24h move, banded. ±2% is the width of ordinary noise on these pools. */
export function trendOf(change: number | null): Reading {
  if (change == null) return { label: "—", tone: "muted" };
  if (change > 2) return { label: "Bullish", tone: "good" };
  if (change < -2) return { label: "Bearish", tone: "bad" };
  return { label: "Flat", tone: "muted" };
}

/**
 * Risk from the two dimensions that actually carry it: how spread the holders
 * are, and how deep the pool is. Both are scored so that higher is safer, so
 * the mean inverts into a risk band. Dimensions with no reading are left out
 * rather than counted as zero — the same rule the overall score uses.
 */
export function riskOf(concentration: number | null, liquidity: number | null): Reading {
  const xs = [concentration, liquidity].filter((v): v is number => v != null);
  if (!xs.length) return { label: "Unrated", tone: "muted" };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean >= 70) return { label: "Low", tone: "good" };
  if (mean >= 40) return { label: "Moderate", tone: "warn" };
  return { label: "Elevated", tone: "bad" };
}

/** How much of the score is actually measured rather than absent. */
export function strengthOf(measured: number, total: number): Reading {
  if (!total) return { label: "—", tone: "muted" };
  const pct = (measured / total) * 100;
  if (pct >= 80) return { label: "Strong", tone: "good" };
  if (pct >= 50) return { label: "Partial", tone: "warn" };
  return { label: "Thin", tone: "muted" };
}

/** Enough points to be a shape rather than a handful of dots. */
const MIN_SPARK_POINTS = 3;

/**
 * The price line. Drawn here rather than with the shared `Sparkline` because
 * that one carries a gradient wash sized for a stat tile; this is a bare line
 * and an endpoint, scaled to its own range so a 2% move still reads as a shape.
 */
function Spark({ points, tone }: { points: number[]; tone: "good" | "bad" }) {
  if (points.length < MIN_SPARK_POINTS) return null;
  const W = 172, H = 44, PAD = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const xy = points.map((v, i) => [
    i * step,
    PAD + (H - PAD * 2) * (1 - (v - min) / span),
  ] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  const stroke = tone === "good" ? "var(--good)" : "var(--bad)";

  return (
    <svg
      width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      className="shrink-0" role="img"
      aria-label={`Price over the last ${points.length} days`}
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.8" fill={stroke} />
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="min-w-0 px-3 text-center first:pl-0 last:pr-0">
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className={`mt-1 text-[13px] font-bold ${TONE[tone]}`}>{value}</div>
    </div>
  );
}

function TradeSide({ slug, side }: { slug: string; side: "buy" | "sell" }) {
  const buy = side === "buy";
  return (
    <Link
      href={`/project/${slug}#trade`}
      className={`flex items-center justify-center gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-150 ${
        buy
          ? "border-good/30 bg-good/10 hover:border-good/50 hover:bg-good/15"
          : "border-bad/30 bg-bad/10 hover:border-bad/50 hover:bg-bad/15"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${
          buy ? "bg-good/20 text-good" : "bg-bad/20 text-bad"
        }`}
        aria-hidden
      >
        {buy ? "↑" : "↓"}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[15px] font-bold">{buy ? "Buy" : "Sell"}</span>
        <span className="block text-[11.5px] text-muted">{buy ? "Go long" : "Go short"}</span>
      </span>
    </Link>
  );
}

export function TradePanel({ p }: { p: IntelProject }) {
  const w = useWallet();
  const signIn = useSignIn();

  const verdict = verdictOf(p.overall);
  const trend = trendOf(p.change_24h);
  const risk = riskOf(p.concentrationScore, p.liquidityScore);
  const strength = strengthOf(p.measured, p.total);
  const up = (p.change_24h ?? 0) >= 0;

  return (
    <div className="card flex h-full flex-col gap-6 p-5 sm:p-6">
      {/* Mirrors the intelligence card's header, which in turn mirrors
          `TrendSectionHeader` — same eyebrow, same 19px title, same subtitle
          size — so the two cards read as a pair. */}
      <div>
        <Eyebrow label="Methodology" color="#9b7ae0" />
        <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
          Turn data into action.
        </h2>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
          Use data-backed insights to trade with clarity, not guesswork.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface2/30 p-4 sm:p-5">
        <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-surface2/60 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink2">
          Ready to trade
          <span className="h-1.5 w-1.5 rounded-full bg-good pulse" />
        </span>

        {/*
         * Signed out the panel leads with connecting; signed in that step is
         * done, so the heading names the project and Buy/Sell become the first
         * action rather than the alternative to one.
         */}
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-accent/30"
            style={{ background: "var(--accent-dim)" }}
            aria-hidden
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17.5 10 11l3.5 3.5L20 7" /><path d="M15 7h5v5" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight">
              {w.session ? `Trade ${p.name} with real-time intelligence` : "Start trading with real-time intelligence"}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink2">
              {w.session
                ? "Your wallet is connected. Every reading below is live."
                : "Connect your wallet to unlock optimized buy & sell opportunities."}
            </p>
          </div>
        </div>

        {!w.session && (
          <>
            <button
              type="button"
              onClick={() => signIn.open()}
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

            <div className="flex items-center gap-3 text-[11.5px] text-faint">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TradeSide slug={p.slug} side="buy" />
          <TradeSide slug={p.slug} side="sell" />
        </div>

        {/* ------------------------------------------------- market view */}
        <div className="rounded-xl border border-line bg-page/40 p-4">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-[12.5px] font-medium text-ink2">
              {p.symbol ? `${p.symbol} · ` : ""}{p.name}
            </span>
            <span className="shrink-0 rounded-md bg-surface2 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
              Market view
            </span>
          </div>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className={`text-[28px] font-extrabold leading-none tracking-tight ${TONE[verdict.tone]}`}>
                {verdict.label}
              </div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-muted">{verdict.note}</div>
            </div>
            <Spark points={p.spark} tone={up ? "good" : "bad"} />
          </div>

          <div className="mt-4 flex divide-x divide-line border-t border-line pt-3">
            <div className="min-w-0 flex-1"><Stat label="Trend" value={trend.label} tone={trend.tone} /></div>
            <div className="min-w-0 flex-1"><Stat label="Risk level" value={risk.label} tone={risk.tone} /></div>
            <div className="min-w-0 flex-1"><Stat label="Data strength" value={strength.label} tone={strength.tone} /></div>
          </div>

          {p.change_24h != null && (
            <div className="mt-3 text-center text-[10.5px] text-faint">
              Trend from the last 24h ({fmtPct(p.change_24h)}) · risk from holder spread and pool depth
            </div>
          )}
        </div>
      </div>

      {/* Leaves the page for the project's own overview, where the score above
          is shown broken into the dimensions it is built from. Both in-page
          destinations this used to have — the research section, then the FAQ —
          are parked, and the overview is the working version of what they
          described rather than a substitute for it. */}
      <Link
        href={`/project/${p.slug}#overview`}
        className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2/40 px-4 py-3.5 text-[13px] font-medium text-ink2 transition-colors duration-150 hover:border-line2 hover:bg-surface2 hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
          <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
        </svg>
        View methodology <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
