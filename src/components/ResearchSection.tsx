import Link from "next/link";
import type { Scoreboard } from "@/lib/scoreboard";
import { IconBadge, TrendSectionHeader, type IconName } from "./viz";

/**
 * How a project page is put together, next to what it produces.
 *
 * Both halves are the real thing: the framework on the left names the
 * dimensions `healthScore` actually scores, and the dashboard on the right is
 * the featured project's own score, rank and flags — not a mock. The one
 * figure here that is not read straight off a table is each bar's composition,
 * and that is arithmetic on the score rather than a judgement.
 */

/** Chart geometry. Bars are drawn in SVG so the stack needs no layout pass. */
const CHART_H = 132;
const BAR_W = 15;
const BAR_GAP = 7;
/** Enough bars to read as a distribution, few enough that each stays legible. */
const MAX_BARS = 16;
/** Surface showing between stacked segments, so bands never merge. */
const SEG_GAP = 2;

function Step({ n, title, right }: { n: number; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line2 text-[11px] font-semibold text-ink2">
        {n}
      </span>
      <h3 className="text-[14px] font-bold">{title}</h3>
      {right}
    </div>
  );
}

function Block({ icon, color, title, children }: {
  icon: IconName; color: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <IconBadge name={icon} color={color} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{title}</div>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-md border border-line bg-surface2/50 px-2 py-1 text-[11px] text-ink2">
      {children}
    </span>
  );
}

function StatTile({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface2/40 px-3.5 py-3">
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className="num mt-1 text-[19px] font-bold leading-none">{value}</div>
      <div className={`mt-1.5 text-[10.5px] ${
        tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-muted"
      }`}>
        {sub}
      </div>
    </div>
  );
}

/** What each dimension is read from — the actual ingest surface, named. */
const SOURCES = [
  "On-chain treasury flows",
  "Fundraising & valuation data",
  "Holder distribution & activity",
  "Market liquidity & price history",
  "GitHub commits & releases",
  "Governance proposals & voting",
];

export function ResearchSection({ board }: { board: Scoreboard }) {
  const { featured, series } = board;
  if (!featured || !series.length) return null;

  const bars = board.projects.slice(0, MAX_BARS);
  const chartW = bars.length * (BAR_W + BAR_GAP) - BAR_GAP;
  const coverage = (featured.measured / featured.total) * 100;
  // Rank as a percentile, so "#3 of 23" also reads as how good that is.
  const percentile = Math.round((featured.rank / featured.ranked) * 100);
  const verdict = featured.overall >= 70 ? "Strong" : featured.overall >= 40 ? "Moderate" : "Weak";

  return (
    <section className="card p-5 lg:p-6">
      <TrendSectionHeader
        eyebrow="Research Methodology"
        color="#9b7ae0"
        title="Deep expertise meets deep data."
        subtitle="How a project score is built, and what it produces — worked through on a real project."
        action={
          <Link href={`/project/${featured.slug}`} className="text-[11px] text-accent hover:underline">
            worked example →
          </Link>
        }
        divider
      />
      <div className="grid gap-8 lg:grid-cols-2">
        {/* ---------------------------------------------- 1. the framework */}
        <div className="flex h-full flex-col justify-between gap-5">
          <Step n={1} title="Research framework" />

          <Block icon="info" color="var(--accent)" title="Research question">
            <div className="rounded-lg border border-line bg-surface2/40 px-3 py-2.5 text-[12.5px] text-ink2">
              What is the long-term potential of{" "}
              <Link href={`/project/${featured.slug}`} className="text-accent hover:underline">
                {featured.name}
              </Link>
              ?
            </div>
          </Block>

          <Block icon="layers" color="#9085e9" title="Analytical framework">
            <div className="flex flex-wrap gap-1.5">
              {series.map((s) => <Tag key={s.key}>{s.label}</Tag>)}
            </div>
          </Block>

          <Block icon="bars" color="var(--good)" title="Data selection">
            <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {SOURCES.map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-[11.5px] text-ink2">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-good" />
                  {s}
                </span>
              ))}
            </div>
          </Block>

          <Block icon="target" color="#e08a3c" title="Scoring">
            <p className="text-[11.5px] leading-relaxed text-muted">
              Each dimension is scored 0–100 from its own measured inputs, and the headline
              is the mean of the ones that could be measured. Dimensions with no data are
              excluded from the average rather than counted as zero, so the score never
              punishes a project for a gap in our coverage.
            </p>
          </Block>
        </div>

        {/* ------------------------------------------------- 2. the output */}
        <div className="space-y-4">
          <Step
            n={2} title="Insights output"
            right={
              <Link href={`/project/${featured.slug}`} className="ml-auto text-[11.5px] text-muted hover:text-accent">
                {featured.name} →
              </Link>
            }
          />

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              label="Health Score" value={`${featured.overall}/100`} sub={verdict}
              tone={featured.overall >= 70 ? "good" : featured.overall >= 40 ? "warn" : undefined}
            />
            <StatTile
              label="Overall Rank" value={`#${featured.rank}`}
              sub={`of ${featured.ranked} tracked`}
            />
            <StatTile
              label="Percentile" value={`Top ${percentile}%`}
              sub="by score"
            />
            <StatTile
              label="Data Coverage" value={`${coverage.toFixed(0)}%`}
              sub={`${featured.measured} of ${featured.total} dims`}
              tone={coverage >= 80 ? "good" : "warn"}
            />
          </div>

          {/* ------------------------------------------ score breakdown */}
          <div className="rounded-xl border border-line bg-surface2/40 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-semibold">Overall Score Breakdown</span>
              <span className="text-[10.5px] text-faint">top {bars.length} by score</span>
            </div>

            <div className="mt-3 flex gap-2">
              <div className="flex flex-col justify-between py-px text-[9.5px] text-faint" style={{ height: CHART_H }}>
                <span>100</span><span>50</span><span>0</span>
              </div>
              <div className="scroll-x min-w-0 flex-1">
                <svg
                  width={chartW} height={CHART_H} viewBox={`0 0 ${chartW} ${CHART_H}`}
                  role="img" aria-label="Health score composition by dimension, per project"
                >
                  {bars.map((p, i) => {
                    const x = i * (BAR_W + BAR_GAP);
                    // Stack from the baseline up, in the legend's order, so the
                    // same dimension sits in the same place in every bar.
                    let y = CHART_H;
                    return (
                      <g key={p.slug}>
                        <title>{`${p.name} — ${p.overall}/100 from ${p.measured} dimensions`}</title>
                        {series.map((s) => {
                          const part = p.parts.find((q) => q.key === s.key);
                          if (!part) return null;
                          const h = (part.contribution / 100) * CHART_H;
                          if (h <= 0) return null;
                          y -= h;
                          return (
                            <rect
                              key={s.key}
                              x={x} y={y} width={BAR_W}
                              // The gap is carved out of the segment rather than
                              // added between, so the stack still totals the score.
                              height={Math.max(h - SEG_GAP, 0.5)}
                              fill={s.color} rx="1.5"
                            />
                          );
                        })}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
              {series.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-[10.5px] text-ink2">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* ------------------------------------------------ AI summary */}
          {featured.insights.length > 0 && (
            <div className="rounded-xl border border-line bg-surface2/40 px-4 py-3.5">
              <div className="text-[12px] font-semibold">AI Summary</div>
              <div className="mt-2 flex gap-3">
                <IconBadge name="shield" color="var(--good)" size={28} />
                <p className="text-[11.5px] leading-relaxed text-ink2">
                  <span className="font-medium text-ink">{featured.name}</span>{" "}
                  {featured.insights.slice(0, 3).join(" ")}
                </p>
              </div>
            </div>
          )}

          {featured.risks.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2/40 px-4 py-3">
              <IconBadge name="clock" color="var(--warn)" size={28} />
              <span className="shrink-0 text-[12px] font-semibold">Key Risks</span>
              <div className="flex flex-wrap gap-1.5">
                {featured.risks.slice(0, 3).map((r) => <Tag key={r}>{r}</Tag>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
