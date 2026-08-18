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
import {
  fmtUsd,
  fmtPrice,
  fmtNum,
  fmtPct,
  fmtDate,
  shortAddr,
} from "@/lib/format";

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

  const performanceTone =
    roi == null ? "text-muted" : roi >= 0 ? "text-success" : "text-warn";

  const summaryDescription =
    p.description ||
    "No project description is currently available for this project.";

  const topSignals = signals.slice(0, 4);

  const recentEvents = [...events].sort((a, b) => b.ts - a.ts).slice(0, 4);

  /*
   * Period helper.
   *
   * This keeps the Summary compatible with the existing
   * periodReturns() object without changing the query layer.
   */
  const getPeriod = (key: string): number | null => {
    const value = (periods as Record<string, number | null | undefined>)[key];

    return value ?? null;
  };

  const period24h = getPeriod("24h");
  const period7d = getPeriod("7d");
  const period30d = getPeriod("30d");
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
      <HealthScorePanel hs={hs} updatedAt={hsUpdatedAt} />

      <CompareRaisePanel d={d} />

      <RiskPanel risk={d.risk} flags={parseRisks(d.risk)} />

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

      <ListingsPanel listings={d.listings} />

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
   * SUMMARY
   *
   * This section is intentionally different from Overview.
   *
   * Overview = detailed analytical panels.
   * Summary = readable project/investment snapshot.
   *
   * The structure uses clear section headings and explanatory
   * subheadings so the page feels more like a research brief
   * rather than another dashboard.
   */

  const summary = (
    <div className="space-y-10">
      {/* =====================================================
          ABOUT THE PROJECT
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[22px] font-semibold tracking-tight text-ink">
            About {p.name}
          </h2>

          <p className="mt-2 text-[13px] leading-6 text-ink2">
            {summaryDescription}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface2/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Status
            </div>

            <div className="mt-1 text-[13px] font-medium text-ink">
              {p.status || "—"}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface2/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Category
            </div>

            <div className="mt-1 text-[13px] font-medium text-ink">
              {p.category || "—"}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface2/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Token
            </div>

            <div className="mt-1 text-[13px] font-medium text-ink">
              {p.symbol ?? p.name}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface2/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Holders
            </div>

            <div className="mt-1 text-[13px] font-medium num text-ink">
              {latestHolders?.holder_count != null
                ? fmtNum(latestHolders.holder_count)
                : "—"}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          MARKET PERFORMANCE
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Market Performance
          </h2>

          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            How {p.symbol ?? p.name} is performing in the market today,
            including its current valuation, liquidity, trading activity and
            performance against the project's raise and historical high.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Price
            </div>

            <div className="mt-1.5 text-[22px] font-semibold num text-ink">
              {fmtUsd(latest?.price_usd)}
            </div>

            <div className="mt-1 text-[11px]">
              <Delta v={latest?.change_24h} />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Market Cap
            </div>

            <div className="mt-1.5 text-[22px] font-semibold num text-ink">
              {fmtUsd(latest?.mcap)}
            </div>

            <div className="mt-1 text-[11px] text-muted">
              FDV {fmtUsd(latest?.fdv)}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Liquidity
            </div>

            <div
              className={`mt-1.5 text-[22px] font-semibold num ${liquidityTone}`}
            >
              {fmtUsd(latest?.liquidity_usd)}
            </div>

            <div className="mt-1 text-[11px] text-muted">{liquidityLabel}</div>
          </div>

          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              24H Volume
            </div>

            <div className="mt-1.5 text-[22px] font-semibold num text-ink">
              {fmtUsd(latest?.vol24h)}
            </div>

            <div className="mt-1 text-[11px] text-muted">
              Current trading volume
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCell
            label="24H Return"
            value={period24h != null ? fmtPct(period24h) : NA}
          />

          <MetricCell
            label="7D Return"
            value={period7d != null ? fmtPct(period7d) : NA}
          />

          <MetricCell
            label="30D Return"
            value={period30d != null ? fmtPct(period30d) : NA}
          />

          <MetricCell
            label="From ATH"
            value={fromAth != null ? fmtPct(fromAth) : NA}
          />
        </div>
      </section>

      {/* =====================================================
          INVESTMENT SNAPSHOT
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Investment Snapshot
          </h2>

          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            A compact view of the project's current health, valuation, treasury
            strength, liquidity and performance.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Health Score
            </div>

            <div
              className={`mt-1.5 text-[25px] font-semibold num ${healthTone}`}
            >
              {healthScoreValue != null ? `${healthScoreValue}/100` : "—"}
            </div>

            <div className="mt-1 text-[11px] text-muted">{healthLabel}</div>
          </div>

          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              ROI vs Raise
            </div>

            <div
              className={`mt-1.5 text-[25px] font-semibold num ${performanceTone}`}
            >
              {roi != null ? <Delta v={roi} /> : "—"}
            </div>

            <div className="mt-1 text-[11px] text-muted">
              {rp
                ? `from ${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`
                : "No raise baseline"}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Treasury
            </div>

            <div className="mt-1.5 text-[25px] font-semibold num text-ink">
              {treasuryValue != null && treasuryValue < 1
                ? "~$0"
                : fmtUsd(treasuryValue)}
            </div>

            <div className="mt-1 text-[11px] text-muted">USDC AUM on-chain</div>
          </div>

          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Development
            </div>

            <div className="mt-1.5 text-[25px] font-semibold num text-ink">
              {devScore.overall != null ? `${devScore.overall}/100` : "—"}
            </div>

            <div className="mt-1 text-[11px] text-muted">
              {p.github ? "GitHub activity" : "No GitHub linked"}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          RAISE & TOKEN ECONOMICS
      ====================================================== */}

      {(p.raise_amount_usd != null ||
        rp != null ||
        p.raise_fdv_usd != null ||
        p.circulating_supply != null) && (
        <section>
          <div className="max-w-3xl">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">
              Raise & Token Economics
            </h2>

            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              How the project was funded, the valuation established at the
              raise, and how much of the token supply is currently circulating.
            </p>
          </div>

          <div className="mt-5">
            <MetricGrid>
              <MetricCell
                label="Raised"
                value={
                  p.raise_amount_usd != null ? fmtUsd(p.raise_amount_usd) : NA
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
                label="Committed"
                value={
                  p.raise_committed_usd != null
                    ? fmtUsd(p.raise_committed_usd)
                    : NA
                }
                sub={
                  oversubscribed != null
                    ? `${oversubscribed.toFixed(1)}× oversubscribed`
                    : undefined
                }
              />

              <MetricCell
                label="Raise Price"
                value={rp ? `${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}` : NA}
              />

              <MetricCell
                label="Raise FDV"
                value={p.raise_fdv_usd != null ? fmtUsd(p.raise_fdv_usd) : NA}
              />

              <MetricCell
                label="Contributors"
                value={
                  p.raise_contributors != null
                    ? fmtNum(p.raise_contributors)
                    : NA
                }
              />

              <MetricCell
                label="Circulating Supply"
                value={
                  p.circulating_supply != null
                    ? fmtNum(p.circulating_supply)
                    : NA
                }
                sub={
                  p.circulating_supply != null && p.total_supply
                    ? `of ${fmtNum(p.total_supply)} total`
                    : undefined
                }
              />

              <MetricCell
                label="Team Locked"
                value={lockedPct != null ? `${lockedPct.toFixed(1)}%` : NA}
                sub={
                  p.team_package != null ? fmtNum(p.team_package) : undefined
                }
              />

              <MetricCell
                label="Total Supply"
                value={p.total_supply != null ? fmtNum(p.total_supply) : NA}
              />
            </MetricGrid>
          </div>

          {p.raise_note && (
            <p className="mt-3 text-[11px] leading-5 text-muted">
              {p.raise_note}
            </p>
          )}
        </section>
      )}

      {/* =====================================================
          PROJECT HEALTH
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Project Health
          </h2>

          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            A combined view of project health using the available market,
            treasury, holder, development and risk data.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface2/40 p-3.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Health
            </div>

            <div className={`mt-1 text-[20px] font-semibold num ${healthTone}`}>
              {healthScoreValue != null ? healthScoreValue : "—"}
            </div>

            <div className="mt-0.5 text-[11px] text-muted">Overall / 100</div>
          </div>

          <div className="rounded-lg border border-line bg-surface2/40 p-3.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Development
            </div>

            <div className="mt-1 text-[20px] font-semibold num text-ink">
              {devScore.overall != null ? devScore.overall : "—"}
            </div>

            <div className="mt-0.5 text-[11px] text-muted">Developer score</div>
          </div>

          <div className="rounded-lg border border-line bg-surface2/40 p-3.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Holders
            </div>

            <div className="mt-1 text-[20px] font-semibold num text-ink">
              {latestHolders?.holder_count != null
                ? fmtNum(latestHolders.holder_count)
                : "—"}
            </div>

            <div className="mt-0.5 text-[11px] text-muted">Current holders</div>
          </div>

          <div className="rounded-lg border border-line bg-surface2/40 p-3.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Liquidity
            </div>

            <div
              className={`mt-1 text-[20px] font-semibold num ${liquidityTone}`}
            >
              {liquidityLabel}
            </div>

            <div className="mt-0.5 text-[11px] text-muted">
              {fmtUsd(latest?.liquidity_usd)}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line bg-surface2/30 p-4">
          <div className="text-[12px] font-semibold text-ink">Assessment</div>

          <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-ink2">
            {healthScoreValue == null
              ? "There is not enough current data to produce a reliable health assessment."
              : healthScoreValue >= 80
                ? "The project currently shows strong overall health across the available market, treasury, development and activity signals."
                : healthScoreValue >= 60
                  ? "The project currently shows moderate overall health. The detailed Risk, Holders, Treasury and Development sections should be reviewed for additional context."
                  : "The current data indicates areas that require additional attention. Review the Risk, Holders, Treasury and Development sections before making a decision."}
          </p>
        </div>
      </section>

      {/* =====================================================
          KEY INSIGHTS
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Key Insights
          </h2>

          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            Important signals detected from the project's price, holder,
            treasury and market activity.
          </p>
        </div>

        <div className="mt-5">
          {topSignals.length ? (
            <SectionCard
              title="Latest Signals"
              subtitle={`${signals.length} signal${
                signals.length === 1 ? "" : "s"
              } detected from the available project data.`}
            >
              <InsightList items={topSignals} />
            </SectionCard>
          ) : (
            <div className="rounded-xl border border-line bg-surface2/30 px-4 py-6 text-[12px] text-muted">
              No notable signals are currently available.
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          RECENT ACTIVITY
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Recent Activity
          </h2>

          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            The latest notable project events, including launches, listings,
            governance, development releases and market activity.
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-surface2/30">
          {recentEvents.length ? (
            <div className="divide-y divide-grid">
              {recentEvents.map((event) => (
                <div
                  key={`${event.ts}-${event.type}-${event.title}`}
                  className="flex items-start gap-3 px-4 py-3.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface2 text-[10px] font-semibold text-ink2">
                    {EVENT_LABEL[event.type] ?? "•"}
                  </div>

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
            <div className="px-4 py-6 text-[12px] text-muted">
              No recent project activity is available.
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          LINKS
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Links
          </h2>

          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            Official project resources and public references.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {links
            .filter(([, url]) => url)
            .map(([label, url]) => (
              <a
                key={label}
                href={url!}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-line bg-surface2/40 px-3 py-2 text-[11px] font-medium text-ink2 transition hover:bg-surface2 hover:text-ink"
              >
                {label} ↗
              </a>
            ))}

          {p.mint && (
            <a
              href={`https://solscan.io/token/${p.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-line bg-surface2/40 px-3 py-2 text-[11px] font-medium text-ink2 transition hover:bg-surface2 hover:text-ink"
              title={p.mint}
            >
              Solscan ↗
            </a>
          )}
        </div>
      </section>

      {/* =====================================================
          OVERALL ASSESSMENT
      ====================================================== */}

      <section className="rounded-xl border border-line bg-surface2/30 p-5">
        <div className="max-w-3xl">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
            Overall Assessment
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className={`text-[34px] font-semibold num ${healthTone}`}>
              {healthScoreValue != null ? healthScoreValue : "—"}
            </div>

            <div className="pb-1 text-[13px] text-muted">
              / 100 health score
            </div>
          </div>

          <p className="mt-3 text-[12px] leading-5 text-ink2">
            {healthScoreValue == null
              ? "An overall assessment cannot currently be produced because sufficient data is not available."
              : healthScoreValue >= 80
                ? `The available data currently indicates a strong project profile with a health score of ${healthScoreValue}/100. Review the detailed analytical tabs for the evidence behind this score.`
                : healthScoreValue >= 60
                  ? `The available data currently indicates a moderate project profile with a health score of ${healthScoreValue}/100. Additional review of risk, holders, treasury and development activity is recommended.`
                  : `The available data currently indicates a higher-risk project profile with a health score of ${healthScoreValue}/100. The detailed analytical sections should be reviewed carefully.`}
          </p>
        </div>
      </section>
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
