import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import {
  projectDetail,
  priceIsReliable,
  MIN_LIQUIDITY_USD,
  parseLanguages,
  parseCodeFrequency,
  parseRisks,
  raisePriceOf,
  tradingStart,
  periodReturns,
} from "@/lib/queries";
import { healthScore, insights, developerScore } from "@/lib/analytics";
import { DevelopmentPanel } from "@/components/Development";
import { buildMemo } from "@/lib/research";
import { PriceChart } from "@/components/PriceChart";
import { Tabs, type TabDef } from "@/components/Tabs";
import { HealthScorePanel } from "@/components/HealthScore";
import {
  HoldersPanel,
  SmartMoneyPanel,
  TreasuryPanel,
  CompareRaisePanel,
  NewsPanel,
  ResearchPanel,
  GovernancePanel,
  TimelinePanel,
  InsightList,
  ListingsPanel,
  RiskPanel,
  SectionCard,
  Metric,
  DashboardCard,
  CardAction,
  CardTag,
  MetricGrid,
  MetricCell,
  CardNote,
  NA,
} from "@/components/panels";
import { TradeTerminal } from "@/components/TradeTerminal";
import { TokenInvestment } from "@/components/TokenInvestment";
import { PortfolioCard } from "@/components/PortfolioCard";
import { ProjectBrief } from "@/components/ProjectBrief";
import { MarketDepthPanel } from "@/components/MarketDepth";
import { Delta, Logo, StatTile, StatusBadge } from "@/components/ui";
import { Icon, IconBadge, type IconName } from "@/components/viz";
import {
  fmtUsd,
  fmtPrice,
  fmtNum,
  fmtPct,
  fmtDate,
  shortAddr,
} from "@/lib/format";
import type { Insight } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  raise_closed: "R",
  token_launch: "L",
  proposal: "P",
  github_release: "G",
  listing: "X",
  news: "N",
  whale_buy: "W",
  whale_sell: "W",
  unlock: "U",
  buyback: "B",
};

/**
 * A label/value pair rendered as plain text — no border, no fill, no card.
 * The Summary tab reads like a document (headings and rows of figures), not
 * a dashboard of tiles, so this deliberately skips the bordered, `bg-surface`
 * treatment `MetricCell` uses everywhere else on this page.
 */
function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.07em] text-muted">
        {label}
      </div>
      <div
        className={`num mt-1 text-[15px] font-semibold text-ink ${tone ?? ""}`}
      >
        {value}
      </div>
      {sub != null && (
        <div className="mt-0.5 text-[11px] leading-snug text-muted">{sub}</div>
      )}
    </div>
  );
}

/** A section of the Summary: a heading, an optional one-line note, and content below — divided from the next section by a rule, not a card border. */
function TextSection({
  title,
  subtitle,
  right,
  first,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Skip the top divider on the first section of the tab. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={first ? "" : "border-t border-grid pt-6"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {right}
      </div>
      {subtitle && (
        <p className="mt-1 text-[12px] leading-5 text-muted">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Linear 0-100 band, clamped — the same shape `healthScore()` uses
 * internally, reused here rather than reinvented.
 */
function bandScore(v: number, floor: number, ceil: number): number {
  if (ceil === floor) return 50;
  return Math.max(
    0,
    Math.min(100, Math.round(((v - floor) / (ceil - floor)) * 100)),
  );
}

/** `Insight.kind` → the closest icon this app's icon set already has. */
function iconForKind(kind: string): IconName {
  switch (kind) {
    case "holders":
      return "users";
    case "volume":
      return "bars";
    case "price":
      return "chart";
    case "liquidity":
      return "droplet";
    case "treasury":
      return "bank";
    case "dev":
      return "code";
    case "raise":
      return "coin";
    default:
      return "info";
  }
}

/**
 * A short title for a signal, from the same `kind`/`tone` `insights()`
 * already computed — not a new judgement, just a heading for the sentence
 * that follows it.
 */
function signalTitle(kind: string, tone: Insight["tone"]): string {
  const titles: Record<string, Partial<Record<Insight["tone"], string>>> = {
    holders: { good: "Holder growth", bad: "Holder decline" },
    volume: { good: "Volume rising", bad: "Volume falling" },
    price: { good: "Near all-time high", bad: "Well off all-time high" },
    liquidity: { good: "Deep liquidity", bad: "Thin liquidity" },
    treasury: { good: "Strong treasury backing", bad: "Treasury depleted" },
    dev: { good: "Active development", bad: "Development stalled" },
    raise: { neutral: "Raise oversubscribed" },
  };
  return (
    titles[kind]?.[tone] ??
    (tone === "good"
      ? "Positive signal"
      : tone === "bad"
        ? "Risk signal"
        : "Notable signal")
  );
}

const GAUGE_CX = 130;
const GAUGE_CY = 128;
const GAUGE_R = 100;

/** A point on the gauge's semicircle for a 0–100 score: 0 is due left, 100 due right, 50 straight up. */
function gaugePoint(r: number, score: number): { x: number; y: number } {
  const angle = Math.PI * (1 - score / 100);
  return {
    x: GAUGE_CX + r * Math.cos(angle),
    y: GAUGE_CY - r * Math.sin(angle),
  };
}

function gaugeArc(r: number, fromScore: number, toScore: number): string {
  const a = gaugePoint(r, fromScore);
  const b = gaugePoint(r, toScore);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * Semicircular SELLING ↔ BUYING speedometer. The needle angle is computed
 * directly from `score` — never positioned to match a label by hand.
 *
 * This app's data model carries no buy/sell volume, trade count or
 * buyer/seller split (see where `marketBiasScore` is built, below) — so
 * `score` is a price-momentum read, not the four-signal blend a real
 * order-flow feed would allow, and `confidence` never reaches "High"
 * because of that.
 */
function MarketPulseGauge({
  score,
  label,
  confidence,
}: {
  score: number | null;
  label: string | null;
  confidence: "Low" | "Medium" | null;
}) {
  const color =
    score == null
      ? "var(--ink-muted)"
      : score >= 65
        ? "var(--good)"
        : score >= 36
          ? "var(--warn)"
          : "var(--bad)";

  const dim = score == null;
  // Drawn pointing left by default (score 0); the CSS animation rotates it
  // clockwise up to this angle, so 0deg stays score 0 and 180deg is score 100.
  const rotationDeg = ((score ?? 0) / 100) * 180;
  const needleLen = GAUGE_R - 26;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 260 158"
        className="w-full max-w-[300px]"
        role="meter"
        aria-valuenow={score ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          score == null
            ? "Market pulse: insufficient market activity data"
            : `Market pulse: ${label}, ${score} out of 100, ${confidence ?? "low"} confidence`
        }
      >
        <path
          d={gaugeArc(GAUGE_R, 0, 35)}
          fill="none"
          stroke="var(--bad)"
          strokeOpacity={dim ? 0.25 : 0.9}
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d={gaugeArc(GAUGE_R, 35, 65)}
          fill="none"
          stroke="var(--warn)"
          strokeOpacity={dim ? 0.25 : 0.9}
          strokeWidth="16"
        />
        <path
          d={gaugeArc(GAUGE_R, 65, 100)}
          fill="none"
          stroke="var(--good)"
          strokeOpacity={dim ? 0.25 : 0.9}
          strokeWidth="16"
          strokeLinecap="round"
        />

        {!dim && (
          <g
            className="gauge-needle"
            style={
              {
                "--needle-rotation": `${rotationDeg}deg`,
              } as React.CSSProperties
            }
          >
            <line
              x1={GAUGE_CX}
              y1={GAUGE_CY}
              x2={GAUGE_CX - needleLen}
              y2={GAUGE_CY}
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx={GAUGE_CX} cy={GAUGE_CY} r="6" fill={color} />
          </g>
        )}

        <text
          x="14"
          y="150"
          fontSize="10"
          letterSpacing="0.5"
          fill="var(--ink-faint)"
        >
          SELLING
        </text>
        <text
          x={GAUGE_CX}
          y="150"
          textAnchor="middle"
          fontSize="10"
          letterSpacing="0.5"
          fill="var(--ink-faint)"
        >
          NEUTRAL
        </text>
        <text
          x="246"
          y="150"
          textAnchor="end"
          fontSize="10"
          letterSpacing="0.5"
          fill="var(--ink-faint)"
        >
          BUYING
        </text>
      </svg>

      {/* Text lives entirely outside the arc's sweep, below the SVG — the
          needle can point anywhere from due-left to due-right, so anything
          placed inside the hollow gets crossed at some score. */}
      <div className="-mt-3 flex flex-col items-center">
        <span
          className="num text-[34px] font-bold leading-none tracking-tight"
          style={{ color }}
        >
          {score ?? "—"}
        </span>
        <span className="num mt-1 text-[11px] text-faint">/ 100</span>
        <span className="mt-1.5 text-[13px] font-semibold" style={{ color }}>
          {label ?? "Insufficient data"}
        </span>
      </div>

      {confidence && (
        <span className="mt-3 rounded-full border border-line px-2.5 py-1 text-[10.5px] text-muted">
          {confidence} confidence
        </span>
      )}
    </div>
  );
}

/** A proportional horizontal bar for Valuation Structure — width scales against the row set's own max, not a fixed 100. */
function ValueBar({
  label,
  value,
  max,
  color = "var(--accent)",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11.5px]">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold text-ink">{fmtUsd(value)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-grid">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // The real gate. `proxy.ts` only saw that a cookie existed;
  // this is where a forged or expired one is turned away.
  await requireSession(`/project/${slug}`);

  const d = await projectDetail(slug);
  console.log(d);
  if (!d) notFound();

  const {
    project: p,
    latest,
    candles,
    events,
    holderHistory,
    github,
    treasuryValue,
    ath,
    athTs,
  } = d;

  // The clock is read once, here, so the panels that take it stay pure
  // and their period-over-period deltas are reproducible from their inputs.
  // This page is force-dynamic and renders once per request.
  // eslint-disable-next-line react-hooks/purity
  const nowSec = Math.floor(Date.now() / 1000);

  const tradable = priceIsReliable(latest?.liquidity_usd);

  const rp = raisePriceOf(p);

  const roi =
    rp && latest?.price_usd && tradable
      ? ((latest.price_usd - rp.usd) / rp.usd) * 100
      : null;

  const athReturn =
    rp && ath && tradable ? ((ath - rp.usd) / rp.usd) * 100 : null;

  const fromAth =
    ath && latest?.price_usd && tradable
      ? ((latest.price_usd - ath) / ath) * 100
      : null;

  const tradingFrom = tradingStart(p, candles);

  const periods = periodReturns(candles, latest?.price_usd ?? null, nowSec);

  const daysToAth =
    athTs && tradingFrom
      ? Math.max(0, Math.round((athTs - tradingFrom) / 86400))
      : null;

  const latestHolders = holderHistory.length
    ? holderHistory[holderHistory.length - 1]
    : null;

  const refunded =
    p.raise_committed_usd && p.raise_amount_usd
      ? (1 - p.raise_amount_usd / p.raise_committed_usd) * 100
      : null;

  const oversubscribed =
    p.raise_committed_usd && p.raise_amount_usd
      ? p.raise_committed_usd / p.raise_amount_usd
      : null;

  const lockedPct =
    p.team_package && p.total_supply
      ? (p.team_package / p.total_supply) * 100
      : null;

  /**
   * A raise that took money without a launchpad track was a private round,
   * and that is why half the sheet is blank for it.
   */
  const privateRound =
    p.raise_track == null && !!p.raise_amount_usd && p.raise_amount_usd > 0;

  const fullFloat =
    !!p.circulating_supply &&
    !!p.total_supply &&
    p.circulating_supply >= p.total_supply;

  const hs = healthScore(d);

  // Freshness stamp for the health panel.
  const hsUpdatedAt =
    Math.max(
      holderHistory.length ? holderHistory[holderHistory.length - 1].ts : 0,
      candles.length ? candles[candles.length - 1].ts : 0,
      github?.ts ?? 0,
    ) || null;

  const signals = insights(d);

  const devScore = developerScore(github, !!p.github);

  const languages = parseLanguages(github);

  const codeFrequency = parseCodeFrequency(github);

  const memo = buildMemo(d);

  const chartEvents = events.map((e) => ({
    time: e.ts,
    label: EVENT_LABEL[e.type] ?? "•",
    title: e.title,
    type: e.type,
    detail: e.detail,
  }));

  const links: [string, string | null][] = [
    ["Website", p.website],
    ["X", p.twitter],
    ["Discord", p.discord],
    ["Telegram", p.telegram],
    ["GitHub", p.github],
    ["Docs", p.docs],
  ];

  /*
   * Summary helpers
   *
   * Kept local and minimal — every value here is derived from `d` (or the
   * blocks above) rather than a new query, so the Summary stays dynamic for
   * any project and never fabricates a metric the data model doesn't have.
   */

  const healthScoreValue = hs.overall ?? null;

  const healthLabel =
    healthScoreValue == null
      ? "Not available"
      : healthScoreValue >= 80
        ? "Strong"
        : healthScoreValue >= 60
          ? "Moderate"
          : "Needs attention";

  const healthTone =
    healthScoreValue == null
      ? "text-muted"
      : healthScoreValue >= 80
        ? "text-success"
        : healthScoreValue >= 60
          ? "text-brand"
          : "text-warn";

  const summaryDescription =
    p.description ||
    "No project description is currently available for this project.";

  const liquidityLabel =
    latest?.liquidity_usd == null
      ? "Not available"
      : tradable
        ? "Healthy"
        : "Thin";

  const liquidityTone =
    latest?.liquidity_usd == null
      ? "text-muted"
      : tradable
        ? "text-success"
        : "text-warn";

  const liquidityToMcapPct =
    latest?.liquidity_usd != null && latest?.mcap
      ? (latest.liquidity_usd / latest.mcap) * 100
      : null;

  const fdvToMcapMultiple =
    latest?.fdv != null && latest?.mcap ? latest.fdv / latest.mcap : null;

  const treasuryToMcapPct =
    treasuryValue != null && latest?.mcap
      ? (treasuryValue / latest.mcap) * 100
      : null;

  const turnoverPct =
    latest?.vol24h != null && latest?.liquidity_usd
      ? (latest.vol24h / latest.liquidity_usd) * 100
      : null;

  const firstHolderSnapshot =
    holderHistory.length > 1 ? holderHistory[0] : null;

  const holderGrowthPct =
    firstHolderSnapshot?.holder_count != null &&
    latestHolders?.holder_count != null &&
    firstHolderSnapshot.holder_count > 0
      ? ((latestHolders.holder_count - firstHolderSnapshot.holder_count) /
          firstHolderSnapshot.holder_count) *
        100
      : null;

  const circulatingPct =
    p.circulating_supply != null && p.total_supply
      ? (p.circulating_supply / p.total_supply) * 100
      : null;

  const topSignals = signals.slice(0, 4);

  const recentEvents = [...events].sort((a, b) => b.ts - a.ts).slice(0, 4);

  /*
   * Market Pulse
   *
   * There is no buy/sell volume, trade count or buyer/seller split anywhere
   * in `ProjectDetail` — confirmed by inspecting `projectDetail()`, `latest`
   * and every table `queries.ts` reads. (Jupiter's own API separates
   * `buyVolume`/`sellVolume` — see `src/lib/sources/jupiter.ts` — but this
   * app's `jupVolume()` already sums them into one figure before it's
   * stored, so even that split doesn't reach `price_snapshots`. Wiring it
   * through would mean a schema and ingest change, out of scope for a
   * Summary-only redesign.) So this reads price momentum only: 24h change,
   * confirmed against the 30d trend already available from `periods`.
   * Turnover (volume ÷ liquidity) can't say which direction trading leaned,
   * so it only raises confidence, never the score itself.
   */

  const momentum24h = latest?.change_24h ?? null;
  const momentum30d = periods.d30 ?? null;

  const m24Score = momentum24h != null ? bandScore(momentum24h, -20, 20) : null;
  const m30Score = momentum30d != null ? bandScore(momentum30d, -50, 50) : null;

  const marketBiasScore =
    m24Score != null && m30Score != null
      ? Math.round(m24Score * 0.6 + m30Score * 0.4)
      : (m24Score ?? m30Score);

  const marketBiasLabel =
    marketBiasScore == null
      ? null
      : marketBiasScore >= 80
        ? "Strong Buying"
        : marketBiasScore >= 65
          ? "Buying"
          : marketBiasScore >= 36
            ? "Neutral"
            : marketBiasScore >= 21
              ? "Selling"
              : "Strong Selling";

  // Never "High" — that would need the buy/sell split this data model doesn't have.
  const marketBiasConfidence: "Low" | "Medium" | null =
    marketBiasScore == null
      ? null
      : m24Score != null && m30Score != null && turnoverPct != null
        ? "Medium"
        : "Low";

  const marketPositive = marketBiasScore != null && marketBiasScore >= 65;
  const marketNegative = marketBiasScore != null && marketBiasScore < 36;

  /*
   * Strengths vs Risks — the same `signals` the AI Insights panel already
   * shows, split by the tone `insights()` already assigned. A risk only
   * appears here because `insights()` already decided the data supports it.
   */
  const strengths = signals.filter((s) => s.tone === "good");
  const risks = signals.filter((s) => s.tone === "bad");

  /*
   * Numbers That Matter — a priority-ordered candidate list, filtered to
   * whatever this project actually has, capped at 6. Order is the priority;
   * missing figures simply drop out rather than leaving a blank slot.
   */
  const numberCandidates: { label: string; value: string }[] = [
    latest?.mcap != null && { label: "Market Cap", value: fmtUsd(latest.mcap) },
    latest?.liquidity_usd != null && {
      label: "Liquidity",
      value: fmtUsd(latest.liquidity_usd),
    },
    oversubscribed != null && {
      label: "Raise Demand",
      value: `${oversubscribed.toFixed(1)}×`,
    },
    latestHolders?.holder_count != null && {
      label: "Holders",
      value: fmtNum(latestHolders.holder_count),
    },
    roi != null && { label: "ROI vs Issue", value: fmtPct(roi) },
    healthScoreValue != null && {
      label: "Health",
      value: `${healthScoreValue}/100`,
    },
    latest?.vol24h != null && {
      label: "24H Volume",
      value: fmtUsd(latest.vol24h),
    },
    treasuryToMcapPct != null && {
      label: "Treasury / MC",
      value: `${treasuryToMcapPct.toFixed(0)}%`,
    },
  ].filter((x): x is { label: string; value: string } => !!x);

  const numbersThatMatter = numberCandidates.slice(0, 6);

  /*
   * Valuation Structure — proportional against whichever of these four is
   * largest for this project, not a fixed scale.
   */
  const valuationRows = (
    [
      { label: "FDV", value: latest?.fdv ?? null, color: "var(--accent)" },
      {
        label: "Market Cap",
        value: latest?.mcap ?? null,
        color: "var(--series-2, var(--accent))",
      },
      { label: "Treasury", value: treasuryValue ?? null, color: "var(--good)" },
      {
        label: "Liquidity",
        value: latest?.liquidity_usd ?? null,
        color: "var(--warn)",
      },
    ] as { label: string; value: number | null; color: string }[]
  ).filter(
    (r): r is { label: string; value: number; color: string } =>
      r.value != null && r.value > 0,
  );

  const maxValuation = valuationRows.length
    ? Math.max(...valuationRows.map((r) => r.value))
    : 0;

  /*
   * Raise Story — a step only appears if its own field exists; the whole
   * section is skipped below when there's no raise data at all.
   */
  const hasRaiseData =
    p.raise_goal_usd != null ||
    p.raise_committed_usd != null ||
    p.raise_amount_usd != null ||
    rp != null ||
    p.raise_contributors != null;

  const raiseSteps = [
    p.raise_goal_usd != null && {
      label: "Target",
      value: fmtUsd(p.raise_goal_usd),
    },
    p.raise_committed_usd != null && {
      label: "Committed",
      value: fmtUsd(p.raise_committed_usd),
      sub:
        oversubscribed != null
          ? `${oversubscribed.toFixed(1)}× oversubscribed`
          : undefined,
    },
    p.raise_amount_usd != null && {
      label: "Accepted / Raised",
      value: fmtUsd(p.raise_amount_usd),
    },
    p.raise_contributors != null && {
      label: "Contributors",
      value: fmtNum(p.raise_contributors),
    },
    rp != null && {
      label: "Issue Price",
      value: `${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`,
    },
    p.raise_end_ts != null && {
      label: "Closed",
      value: fmtDate(p.raise_end_ts),
    },
    refunded != null && {
      label: "Est. Refund",
      value: `${refunded.toFixed(0)}%`,
    },
  ].filter((x): x is { label: string; value: string; sub?: string } => !!x);

  /*
   * Token Distribution — circulating vs. team-locked only (the same two
   * figures the raise/tokenomics fields already give); anything the total
   * supply can't attribute to either is left out rather than guessed at.
   */
  const hasSupplyData = p.total_supply != null && p.total_supply > 0;
  const lockedSupplyPct =
    circulatingPct != null ? Math.max(0, 100 - circulatingPct) : null;

  /*
   * Scanner Verdict — one qualitative read per dimension, each backed by a
   * value already computed above, then a single generated sentence built
   * from whichever reads are actually positive or negative (never from a
   * template with blanks filled in).
   */
  const verdictRows: { label: string; ok: boolean | null; text: string }[] = [
    {
      label: "Market",
      ok:
        marketBiasScore == null
          ? null
          : marketPositive
            ? true
            : marketNegative
              ? false
              : null,
      text:
        marketBiasScore == null ? "No reading" : (marketBiasLabel ?? "Neutral"),
    },
    {
      label: "Liquidity",
      ok: latest?.liquidity_usd == null ? null : tradable,
      text: liquidityLabel,
    },
    {
      label: "Holders",
      ok: holderGrowthPct == null ? null : holderGrowthPct > 0,
      text:
        holderGrowthPct == null
          ? "No trend"
          : holderGrowthPct > 0
            ? "Growing"
            : "Declining",
    },
    {
      label: "Raise",
      ok: oversubscribed == null ? null : oversubscribed >= 2,
      text:
        oversubscribed == null
          ? "No raise data"
          : oversubscribed >= 2
            ? "Strong demand"
            : "Modest demand",
    },
    {
      label: "Price",
      ok: roi == null ? null : roi >= 0,
      text:
        roi == null
          ? "No issue price"
          : roi >= 0
            ? "Above issue"
            : "Below issue",
    },
    {
      label: "Risk",
      ok:
        d.risk?.mint_authority == null && d.risk?.freeze_authority == null
          ? null
          : !d.risk.mint_authority && !d.risk.freeze_authority,
      text:
        d.risk == null
          ? "Not checked"
          : !d.risk.mint_authority && !d.risk.freeze_authority
            ? "Authorities revoked"
            : "Authority risk",
    },
  ];

  const verdictPositives = verdictRows
    .filter((r) => r.ok === true)
    .map((r) => `${r.label.toLowerCase()} (${r.text.toLowerCase()})`);
  const verdictNegatives = verdictRows
    .filter((r) => r.ok === false)
    .map((r) => `${r.label.toLowerCase()} (${r.text.toLowerCase()})`);

  const verdictConclusion =
    verdictPositives.length && verdictNegatives.length
      ? `${verdictPositives.length > 1 ? "Several signals" : "One signal"} are positive — ${verdictPositives.join(", ")} — but ${verdictNegatives.join(" and ")} weigh against it.`
      : verdictPositives.length
        ? `The strongest signals right now are ${verdictPositives.join(", ")}.`
        : verdictNegatives.length
          ? `The main concerns right now are ${verdictNegatives.join(" and ")}.`
          : "There isn't enough measured data yet for a clear read on this project.";

  /*
   * PRICE CHART
   */

  const chartBlock = (
    <section className="card p-4 sm:p-5">
      <PriceChart
        candles={candles}
        events={chartEvents}
        slug={slug}
        circulatingSupply={p.circulating_supply}
        name={p.name}
        symbol={p.symbol ?? p.name}
        imageUrl={p.image_url}
        marketCap={latest?.mcap ?? null}
        volume24h={latest?.vol24h ?? null}
        change24h={latest?.change_24h ?? null}
        periods={periods}
        lastUpdated={candles.length ? candles[candles.length - 1].ts : null}
      />
    </section>
  );

  /*
   * OVERVIEW
   */

  const overview = (
    <div className="space-y-5">
      {/* =====================================================
          HEALTH SCORE
      ====================================================== */}

      <HealthScorePanel hs={hs} updatedAt={hsUpdatedAt} />

      {/* =====================================================
          COMPARE RAISE
      ====================================================== */}

      <CompareRaisePanel d={d} />

      {/* =====================================================
          VALUATION STRUCTURE
      ====================================================== */}
      <div className="grid grid-cols-2 gap-4">
        <DashboardCard
          title="Valuation Structure"
          subtitle="How liquidity, treasury and market cap stack up against FDV."
        >
          {valuationRows.length ? (
            <>
              <div className="space-y-3 px-6">
                {valuationRows
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map((r) => (
                    <ValueBar
                      key={r.label}
                      label={r.label}
                      value={r.value}
                      max={maxValuation}
                      color={r.color}
                    />
                  ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 pb-10 px-10 border-t border-grid pt-3 text-[11px] text-muted">
                <span>
                  Liquidity / MC{" "}
                  <span className="num text-ink2">
                    {liquidityToMcapPct != null
                      ? `${fmtNum(liquidityToMcapPct)}%`
                      : "—"}
                  </span>
                </span>

                <span>
                  Treasury / MC{" "}
                  <span className="num text-ink2">
                    {treasuryToMcapPct != null
                      ? `${treasuryToMcapPct.toFixed(0)}%`
                      : "—"}
                  </span>
                </span>

                <span>
                  FDV / MC{" "}
                  <span className="num text-ink2">
                    {fdvToMcapMultiple != null
                      ? `${fmtNum(fdvToMcapMultiple)}×`
                      : "—"}
                  </span>
                </span>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted">
              No valuation figures available yet.
            </p>
          )}
        </DashboardCard>

        {hasSupplyData ? (
          <div className="card px-6">
            <TextSection
              title="Token Distribution"
              subtitle="Circulating float vs. what the team still has locked."
            >
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-grid">
                {circulatingPct != null && (
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${circulatingPct}%` }}
                  />
                )}
                {lockedSupplyPct != null && lockedSupplyPct > 0 && (
                  <div
                    className="h-full bg-warn"
                    style={{ width: `${lockedSupplyPct}%` }}
                  />
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    Circulating
                  </div>
                  <div className="num mt-1 text-[18px] font-bold text-ink">
                    {circulatingPct != null
                      ? `${circulatingPct.toFixed(1)}%`
                      : NA}
                  </div>
                  <div className="text-[11px] text-muted">
                    {p.circulating_supply != null
                      ? fmtNum(p.circulating_supply)
                      : "—"}{" "}
                    tokens
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    Team Locked
                  </div>
                  <div className="num mt-1 text-[18px] font-bold text-ink">
                    {lockedSupplyPct != null
                      ? `${lockedSupplyPct.toFixed(1)}%`
                      : NA}
                  </div>
                  <div className="text-[11px] text-muted">
                    {p.team_package != null ? fmtNum(p.team_package) : "—"}{" "}
                    tokens
                  </div>
                </div>
              </div>

              <div className="mt-4 pb-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-grid pt-3 text-[11px] text-muted">
                <span>
                  Total Supply{" "}
                  <span className="num text-ink2">
                    {p.total_supply != null ? fmtNum(p.total_supply) : "—"}
                  </span>
                </span>
                <span>
                  Launch Valuation{" "}
                  <span className="num text-ink2">
                    {p.raise_fdv_usd != null ? fmtUsd(p.raise_fdv_usd) : "—"}
                  </span>
                </span>
              </div>
            </TextSection>
          </div>
        ) : (
          <div />
        )}
      </div>
      {/* =====================================================
          RISK
      ====================================================== */}

      <RiskPanel risk={d.risk} flags={parseRisks(d.risk)} />

      {/* =====================================================
          AI INSIGHTS
      ====================================================== */}

      <SectionCard
        title="AI Insights"
        subtitle="Notable movements picked out of this project's own price, holder and treasury data."
        right={
          <span className="text-[11px] text-muted">
            {signals.length} signal
            {signals.length === 1 ? "" : "s"}
          </span>
        }
      >
        <InsightList items={signals} />
      </SectionCard>

      {/* =====================================================
          LISTINGS
      ====================================================== */}

      <ListingsPanel listings={d.listings} />

      {/* =====================================================
          RAISE & SUPPLY
      ====================================================== */}

      {(p.raise_amount_usd != null ||
        rp != null ||
        p.circulating_supply != null ||
        p.raise_note != null) && (
        <DashboardCard
          title="Raise & Supply"
          subtitle="How much this project raised, at what price, and how much of the token is circulating today."
          right={
            <>
              {p.raise_track && <CardTag>{p.raise_track}</CardTag>}

              <CardAction href={p.raise_source_url}>View details</CardAction>
            </>
          }
        >
          <MetricGrid>
            <MetricCell
              label="Raised"
              value={
                p.raise_amount_usd == null
                  ? NA
                  : p.raise_amount_usd === 0
                    ? "$0"
                    : fmtUsd(p.raise_amount_usd)
              }
              sub={
                p.raise_amount_usd == null
                  ? "no raise on record"
                  : p.raise_amount_usd === 0
                    ? "fully refunded"
                    : p.raise_end_ts
                      ? `closed ${fmtDate(p.raise_end_ts)}`
                      : undefined
              }
            />

            <MetricCell
              label="Minimum / Goal"
              value={p.raise_goal_usd != null ? fmtUsd(p.raise_goal_usd) : NA}
              sub={
                p.raise_goal_usd == null && privateRound
                  ? "no cap — private round"
                  : undefined
              }
            />

            <MetricCell
              label="Committed"
              value={
                p.raise_committed_usd != null
                  ? fmtUsd(p.raise_committed_usd)
                  : NA
              }
              sub={
                oversubscribed != null
                  ? `${
                      oversubscribed < 10
                        ? oversubscribed.toFixed(1)
                        : Math.round(oversubscribed)
                    }× oversubscribed · ${refunded!.toFixed(0)}% refunded`
                  : p.raise_committed_usd == null && privateRound
                    ? "no commitment book"
                    : undefined
              }
            />

            <MetricCell
              label="Raise Price"
              value={rp ? `${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}` : NA}
              sub={rp?.derived ? "derived: raise ÷ 10M tokens sold" : undefined}
            />

            <MetricCell
              label="Raise FDV"
              value={p.raise_fdv_usd != null ? fmtUsd(p.raise_fdv_usd) : NA}
            />

            <MetricCell
              label="Contributors"
              value={
                p.raise_contributors != null ? fmtNum(p.raise_contributors) : NA
              }
            />

            <MetricCell
              label="Circulating Supply"
              value={
                p.circulating_supply != null ? fmtNum(p.circulating_supply) : NA
              }
              sub={
                p.circulating_supply != null && p.total_supply
                  ? `of ${fmtNum(p.total_supply)} total`
                  : undefined
              }
            />

            <MetricCell
              label="Locked (Team)"
              value={p.team_package != null ? fmtNum(p.team_package) : NA}
              sub={
                lockedPct != null
                  ? `${lockedPct.toFixed(0)}% of supply`
                  : p.team_package == null && fullFloat
                    ? "none — 100% circulating"
                    : undefined
              }
            />
          </MetricGrid>

          {p.raise_note && <CardNote>{p.raise_note}</CardNote>}
        </DashboardCard>
      )}
    </div>
  );

  /*
   * SUMMARY — a decision cockpit, not another set of metric cards.
   *
   * Project Snapshot → Market Pulse + Market Snapshot → What's Happening +
   * Strengths/Risks → Numbers That Matter + Valuation Structure → Raise
   * Story + Token Distribution → Recent Activity + Scanner Verdict.
   *
   * Everything reads from `d` and the blocks already computed above — see
   * the Market Pulse comment for the one deliberate gap (no buy/sell or
   * trade-count data exists in this model) and how it's handled instead of
   * faked. Nothing here restates another tab's full panel — Holders,
   * Treasury, Development, Governance, Timeline, News, Research and the
   * risk flag list all stay exactly where they were.
   */

  const summary = (
    <div className="space-y-6">
      {/* =====================================================
          PROJECT SNAPSHOT
      ====================================================== */}

      <section>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">
            {p.name}
          </h2>

          {p.symbol && (
            <span className="text-[13px] font-medium text-muted">
              ${p.symbol}
            </span>
          )}

          <StatusBadge status={p.status} />

          {p.category && (
            <span className="text-[11px] text-ink2">{p.category}</span>
          )}

          <span title={healthLabel} className={`text-[11px] ${healthTone}`}>
            Health{" "}
            <span className="num font-semibold">
              {healthScoreValue != null ? `${healthScoreValue}/100` : "—"}
            </span>
          </span>
        </div>

        <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-ink2">
          {summaryDescription}
        </p>
      </section>

      {/* =====================================================
          MARKET PULSE + MARKET SNAPSHOT
      ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-2">
        <TextSection
          first
          title="Market Pulse"
          subtitle="Selling vs. buying pressure, read from price momentum."
        >
          <MarketPulseGauge
            score={marketBiasScore}
            label={marketBiasLabel}
            confidence={marketBiasConfidence}
          />

          {marketBiasScore == null ? (
            <p className="mt-4 text-center text-[12px] text-muted">
              Insufficient market activity data — there isn&rsquo;t enough price
              history yet to read momentum from.
            </p>
          ) : (
            <div className="mt-5 space-y-2 border-t border-grid pt-4">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">24H Momentum</span>
                <span className="num font-medium text-ink">
                  {momentum24h != null ? <Delta v={momentum24h} /> : NA}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">30D Momentum</span>
                <span className="num font-medium text-ink">
                  {momentum30d != null ? <Delta v={momentum30d} /> : NA}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">Turnover (Vol ÷ Liquidity)</span>
                <span className="num font-medium text-ink">
                  {turnoverPct != null ? `${fmtNum(turnoverPct)}%` : NA}
                </span>
              </div>
              <p className="pt-1 text-[11px] leading-relaxed text-faint">
                Based on price momentum only — this data source doesn&rsquo;t
                include buy/sell volume or trade counts.
              </p>
            </div>
          )}
        </TextSection>

        <TextSection
          first
          title="Market Snapshot"
          subtitle="Live price, valuation and depth."
          right={
            d.quoteSource ? (
              <span className="text-[11px] text-muted">
                via{" "}
                {d.quoteSource === "dexscreener" ? "DexScreener" : "Jupiter"}
              </span>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Stat
              label="Price"
              value={fmtUsd(latest?.price_usd, { compact: false })}
            />
            <Stat label="24H Change" value={<Delta v={latest?.change_24h} />} />
            <Stat label="Market Cap" value={fmtUsd(latest?.mcap)} />
            <Stat label="FDV" value={fmtUsd(latest?.fdv)} />
            <Stat
              label="Liquidity"
              value={fmtUsd(latest?.liquidity_usd)}
              sub={liquidityLabel}
              tone={liquidityTone}
            />
            <Stat label="24H Volume" value={fmtUsd(latest?.vol24h)} />
            <Stat
              label="Holders"
              value={
                latestHolders?.holder_count != null
                  ? fmtNum(latestHolders.holder_count)
                  : NA
              }
              sub={
                holderGrowthPct != null
                  ? `${fmtPct(holderGrowthPct)} growth`
                  : undefined
              }
            />
          </div>
        </TextSection>
      </div>

      {/* =====================================================
          WHAT'S HAPPENING? + STRENGTHS vs RISKS
      ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-2">
        <TextSection
          title="What's Happening?"
          subtitle="The most notable dynamically generated signals for this project."
        >
          {topSignals.length ? (
            <div className="space-y-3.5">
              {topSignals.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <IconBadge
                    name={iconForKind(s.kind)}
                    color={
                      s.tone === "good"
                        ? "var(--good)"
                        : s.tone === "bad"
                          ? "var(--bad)"
                          : "var(--ink-muted)"
                    }
                    size={28}
                  />
                  <div className="min-w-0 pt-0.5">
                    <div className="text-[12.5px] font-semibold text-ink">
                      {signalTitle(s.kind, s.tone)}
                    </div>
                    <div className="mt-0.5 text-[12px] leading-5 text-ink2">
                      {s.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted">
              No notable signals are currently available.
            </p>
          )}
        </TextSection>

        <TextSection
          title="Strengths vs Risks"
          subtitle="Only shown when the underlying data actually supports it."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-good">
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
                Strengths
              </div>
              {strengths.length ? (
                <ul className="space-y-2.5">
                  {strengths.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[12px] leading-5"
                    >
                      <span className="mt-0.5 shrink-0 text-good">
                        <Icon name={iconForKind(s.kind)} size={13} />
                      </span>
                      <span className="text-ink2">
                        <span className="font-medium text-ink">
                          {signalTitle(s.kind, s.tone)}.
                        </span>{" "}
                        {s.text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted">
                  No standout strengths detected yet.
                </p>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-bad">
                <span className="h-1.5 w-1.5 rounded-full bg-bad" />
                Risks
              </div>
              {risks.length ? (
                <ul className="space-y-2.5">
                  {risks.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[12px] leading-5"
                    >
                      <span className="mt-0.5 shrink-0 text-bad">
                        <Icon name={iconForKind(s.kind)} size={13} />
                      </span>
                      <span className="text-ink2">
                        <span className="font-medium text-ink">
                          {signalTitle(s.kind, s.tone)}.
                        </span>{" "}
                        {s.text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted">
                  No notable risk signals detected.
                </p>
              )}
            </div>
          </div>
        </TextSection>
      </div>

      {/* =====================================================
          NUMBERS THAT MATTER + VALUATION STRUCTURE
      ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-2">
        <TextSection
          title="Numbers That Matter"
          subtitle="The handful of figures that actually move the read on this project."
        >
          {numbersThatMatter.length ? (
            <div className="flex flex-wrap gap-x-8 gap-y-5">
              {numbersThatMatter.map((n) => (
                <div key={n.label}>
                  <div className="num text-[24px] font-bold leading-none tracking-tight text-ink">
                    {n.value}
                  </div>
                  <div className="mt-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted">
                    {n.label}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted">
              Not enough data yet to highlight key numbers.
            </p>
          )}
        </TextSection>

        <TextSection
          title="Valuation Structure"
          subtitle="How liquidity, treasury and market cap stack up against FDV."
        >
          {valuationRows.length ? (
            <>
              <div className="space-y-3">
                {valuationRows
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map((r) => (
                    <ValueBar
                      key={r.label}
                      label={r.label}
                      value={r.value}
                      max={maxValuation}
                      color={r.color}
                    />
                  ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-grid pt-3 text-[11px] text-muted">
                <span>
                  Liquidity / MC{" "}
                  <span className="num text-ink2">
                    {liquidityToMcapPct != null
                      ? `${fmtNum(liquidityToMcapPct)}%`
                      : "—"}
                  </span>
                </span>
                <span>
                  Treasury / MC{" "}
                  <span className="num text-ink2">
                    {treasuryToMcapPct != null
                      ? `${treasuryToMcapPct.toFixed(0)}%`
                      : "—"}
                  </span>
                </span>
                <span>
                  FDV / MC{" "}
                  <span className="num text-ink2">
                    {fdvToMcapMultiple != null
                      ? `${fmtNum(fdvToMcapMultiple)}×`
                      : "—"}
                  </span>
                </span>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted">
              No valuation figures available yet.
            </p>
          )}
        </TextSection>
      </div>

      {/* =====================================================
          RAISE STORY + TOKEN DISTRIBUTION
      ====================================================== */}

      {(hasRaiseData || hasSupplyData) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {hasRaiseData ? (
            <TextSection
              title="Raise Story"
              subtitle="How the raise unfolded, step by step."
            >
              <div className="relative pl-5">
                <div className="absolute bottom-1 left-[3px] top-1 w-px bg-grid" />
                {raiseSteps.map((s) => (
                  <div key={s.label} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-5 top-1 h-[7px] w-[7px] rounded-full border-2 border-page bg-accent" />
                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted">
                      {s.label}
                    </div>
                    <div className="num text-[17px] font-bold leading-tight text-ink">
                      {s.value}
                    </div>
                    {s.sub && (
                      <div className="text-[11px] text-muted">{s.sub}</div>
                    )}
                  </div>
                ))}
              </div>
            </TextSection>
          ) : (
            <div />
          )}

          {hasSupplyData ? (
            <TextSection
              title="Token Distribution"
              subtitle="Circulating float vs. what the team still has locked."
            >
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-grid">
                {circulatingPct != null && (
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${circulatingPct}%` }}
                  />
                )}
                {lockedSupplyPct != null && lockedSupplyPct > 0 && (
                  <div
                    className="h-full bg-warn"
                    style={{ width: `${lockedSupplyPct}%` }}
                  />
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    Circulating
                  </div>
                  <div className="num mt-1 text-[18px] font-bold text-ink">
                    {circulatingPct != null
                      ? `${circulatingPct.toFixed(1)}%`
                      : NA}
                  </div>
                  <div className="text-[11px] text-muted">
                    {p.circulating_supply != null
                      ? fmtNum(p.circulating_supply)
                      : "—"}{" "}
                    tokens
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    Team Locked
                  </div>
                  <div className="num mt-1 text-[18px] font-bold text-ink">
                    {lockedSupplyPct != null
                      ? `${lockedSupplyPct.toFixed(1)}%`
                      : NA}
                  </div>
                  <div className="text-[11px] text-muted">
                    {p.team_package != null ? fmtNum(p.team_package) : "—"}{" "}
                    tokens
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-grid pt-3 text-[11px] text-muted">
                <span>
                  Total Supply{" "}
                  <span className="num text-ink2">
                    {p.total_supply != null ? fmtNum(p.total_supply) : "—"}
                  </span>
                </span>
                <span>
                  Launch Valuation{" "}
                  <span className="num text-ink2">
                    {p.raise_fdv_usd != null ? fmtUsd(p.raise_fdv_usd) : "—"}
                  </span>
                </span>
              </div>
            </TextSection>
          ) : (
            <div />
          )}
        </div>
      )}

      {/* =====================================================
          RECENT ACTIVITY + SCANNER VERDICT
      ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-2">
        <TextSection
          title="Recent Activity"
          subtitle="The latest notable events — the Timeline tab has the full history."
        >
          {recentEvents.length ? (
            <div className="divide-y divide-grid">
              {recentEvents.map((event) => (
                <div
                  key={`${event.ts}-${event.type}-${event.title}`}
                  className="flex items-start gap-3 py-3 first:pt-0"
                >
                  <span className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {EVENT_LABEL[event.type] ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-ink">
                      {event.title}
                    </div>
                    {event.detail && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-muted">
                        {event.detail}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-[10px] text-muted">
                    {fmtDate(event.ts)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted">
              No recent activity available.
            </p>
          )}
        </TextSection>

        <TextSection
          title="Scanner Verdict"
          subtitle="One read, built from every dimension above."
        >
          <div className="flex flex-col items-center border-b border-grid pb-5 text-center">
            <span
              className={`num text-[40px] font-bold leading-none tracking-tight ${healthTone}`}
            >
              {healthScoreValue ?? "—"}
            </span>
            <span className="num mt-0.5 text-[11px] text-faint">/ 100</span>
            <span className="mt-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink2">
              {healthLabel}
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {verdictRows.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between text-[12.5px]"
              >
                <span className="text-muted">{r.label}</span>
                <span
                  className={`flex items-center gap-1.5 font-medium ${
                    r.ok === true
                      ? "text-good"
                      : r.ok === false
                        ? "text-bad"
                        : "text-muted"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      r.ok === true
                        ? "bg-good"
                        : r.ok === false
                          ? "bg-bad"
                          : "bg-line2"
                    }`}
                  />
                  {r.text}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 border-t border-grid pt-4 text-[12.5px] leading-relaxed text-ink2">
            {verdictConclusion}
          </p>
        </TextSection>
      </div>
    </div>
  );

  /*
   * TABS
   */

  const tabs: TabDef[] = [
    {
      key: "overview",
      label: "Overview",
      content: overview,
    },

    {
      key: "summary",
      label: "Summary",
      content: summary,
    },

    {
      key: "holders",
      label: "Holders",
      badge: latestHolders?.holder_count
        ? fmtNum(latestHolders.holder_count)
        : undefined,
      content: <HoldersPanel d={d} />,
    },

    {
      key: "smart",
      label: "Smart Money",
      content: <SmartMoneyPanel d={d} />,
    },

    {
      key: "treasury",
      label: "Treasury",
      content: <TreasuryPanel d={d} nowSec={nowSec} />,
    },

    {
      key: "development",
      label: "Development",
      badge: devScore.overall ?? undefined,
      content: (
        <DevelopmentPanel
          github={github}
          languages={languages}
          codeFrequency={codeFrequency}
          score={devScore}
          githubUrl={p.github}
          releaseCount={d.releases.length}
          recentCommits={d.recentCommits}
        />
      ),
    },

    {
      key: "governance",
      label: "Governance",
      badge: d.proposals.length || undefined,
      content: <GovernancePanel d={d} />,
    },

    {
      key: "timeline",
      label: "Timeline",
      badge: events.length || undefined,
      content: <TimelinePanel events={events} />,
    },

    {
      key: "news",
      label: "News",
      badge: d.news.length || undefined,
      content: <NewsPanel items={d.news} releases={d.releases} project={p} />,
    },

    {
      key: "research",
      label: "Research",
      content: <ResearchPanel memo={memo} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-wrap items-start gap-4">
        <Logo src={p.image_url} name={p.name} size={48} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-tight">
              {p.name}
            </h1>

            {p.symbol && (
              <span className="text-[14px] text-muted">{p.symbol}</span>
            )}

            <StatusBadge status={p.status} />

            {p.category && (
              <span className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] text-ink2">
                {p.category}
              </span>
            )}

            {hs.overall != null && (
              <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink2">
                Health{" "}
                <span className="num font-semibold text-ink">{hs.overall}</span>
                /100
              </span>
            )}
          </div>

          {p.description && (
            <p className="mt-1 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-ink2">
              {p.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
            {links
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <a
                  key={label}
                  href={url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  {label} ↗
                </a>
              ))}

            {p.mint && (
              <a
                href={`https://solscan.io/token/${p.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="num text-muted hover:text-ink2"
                title={p.mint}
              >
                {shortAddr(p.mint)} ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================
          LIQUIDITY WARNING
      ====================================================== */}

      {latest?.price_usd != null && !tradable && (
        <div className="rounded-md border border-warn/40 bg-warn/5 px-4 py-2.5 text-[12px] text-ink2">
          <span className="font-medium text-warn">Thin liquidity.</span> This
          market holds {fmtUsd(latest.liquidity_usd)} of liquidity — below the{" "}
          {fmtUsd(MIN_LIQUIDITY_USD)} threshold where a quoted price reflects
          what the market would actually pay. Return metrics are withheld rather
          than computed from an unreliable price.
        </div>
      )}

      {/* =====================================================
          MARKET STATS
      ====================================================== */}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile
          label="Price"
          value={fmtUsd(latest?.price_usd)}
          sub={<Delta v={latest?.change_24h} />}
        />

        <StatTile
          label="Market Cap"
          value={fmtUsd(latest?.mcap)}
          sub={`FDV ${fmtUsd(latest?.fdv)}`}
        />

        <StatTile
          label="Liquidity"
          value={fmtUsd(latest?.liquidity_usd)}
          sub={`Vol 24h ${fmtUsd(latest?.vol24h)}`}
        />

        <StatTile
          label="Treasury"
          value={
            treasuryValue != null && treasuryValue < 1
              ? "~$0"
              : fmtUsd(treasuryValue)
          }
          sub={
            treasuryValue != null && treasuryValue < 1
              ? "DAO USDC vault is empty"
              : p.raise_amount_usd != null
                ? `raised ${fmtUsd(p.raise_amount_usd)}`
                : "USDC AUM (on-chain)"
          }
        />

        {/* ROI */}
        {roi != null || rp ? (
          <StatTile
            label="ROI vs Raise"
            value={<Delta v={roi} />}
            sub={
              rp
                ? `from ${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`
                : undefined
            }
          />
        ) : (
          <StatTile
            label="Raised"
            value={
              p.raise_amount_usd != null ? fmtUsd(p.raise_amount_usd) : "—"
            }
            sub={
              p.raise_amount_usd == null
                ? "no raise on record"
                : p.raise_track
                  ? `${p.raise_track} launch · no ROI baseline`
                  : "private round · no public token price"
            }
          />
        )}

        <StatTile
          label="From ATH"
          value={<Delta v={fromAth} />}
          sub={
            athReturn != null
              ? `peak ${fmtPct(athReturn)} vs raise`
              : daysToAth != null
                ? `ATH in ${daysToAth}d`
                : athTs
                  ? `ATH ${fmtDate(athTs)}`
                  : undefined
          }
        />
      </div>

      {/* =====================================================
          TRADING + INVESTMENT
      ====================================================== */}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {chartBlock}

          <MarketDepthPanel d={d} nowSec={nowSec} />
        </div>

        <div id="trade">
          <div className="space-y-4">
            {/* Existing trade terminal */}
            <div className="card sticky top-[calc(var(--nav-h)+20px)] overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-grid px-4 py-3">
                <h2 className="text-[14px] font-semibold">
                  Trade {p.symbol ?? p.name}
                </h2>

                <span className="num text-[12px] text-muted">
                  {fmtUsd(latest?.price_usd, {
                    compact: false,
                  })}
                </span>
              </div>

              <div className="px-4 py-4">
                <TradeTerminal
                  symbol={p.symbol ?? p.name}
                  mint={p.mint}
                  price={latest?.price_usd ?? null}
                  liquidity={latest?.liquidity_usd ?? null}
                  vol24h={latest?.vol24h ?? null}
                />
              </div>
            </div>

            {/* Investment */}
            {p.mint && (
              <div className="card overflow-hidden">
                <div className="border-b border-grid px-4 py-3">
                  <h2 className="text-[14px] font-semibold">
                    Invest in {p.symbol ?? p.name}
                  </h2>

                  <p className="mt-0.5 text-[11px] text-muted">
                    Buy this token using your Devnet USDT balance.
                  </p>
                </div>

                <div className="px-4 py-4">
                  <TokenInvestment
                    token={{
                      mint: p.mint,
                      name: p.name,
                      symbol: p.symbol ?? p.name,
                      priceUsd: latest?.price_usd ?? null,
                      imageUrl: p.image_url ?? null,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================
          PROJECT BRIEF
      ====================================================== */}

      <ProjectBrief d={d} />

      {/* =====================================================
          RESEARCH TABS
      ====================================================== */}

      <Tabs tabs={tabs} />
    </div>
  );
}
