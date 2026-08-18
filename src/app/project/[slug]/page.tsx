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
  StatRowCard,
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

  const summaryDescription =
    p.description ||
    "No project description is currently available for this project.";

  const topSignals = signals.slice(0, 4);

  const recentEvents = [...events].sort((a, b) => b.ts - a.ts).slice(0, 4);

  /*
   * Summary-derived metrics
   *
   * Keep the Summary data-driven so the same layout works for every project.
   */
  const targetRaise = p.raise_goal_usd ?? p.raise_amount_usd ?? null;
  const acceptedRaise = p.raise_amount_usd ?? null;
  const committedRaise = p.raise_committed_usd ?? null;

  const refundPct =
    committedRaise != null && acceptedRaise != null && committedRaise > 0
      ? Math.max(0, (1 - acceptedRaise / committedRaise) * 100)
      : null;

  const oversubscriptionSummary =
    committedRaise != null && acceptedRaise != null && acceptedRaise > 0
      ? committedRaise / acceptedRaise
      : null;

  const treasuryBackingPct =
    treasuryValue != null && latest?.mcap != null && latest.mcap > 0
      ? (treasuryValue / latest.mcap) * 100
      : null;

  const liquidityPct =
    latest?.liquidity_usd != null && latest?.mcap != null && latest.mcap > 0
      ? (latest.liquidity_usd / latest.mcap) * 100
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

  const holderGrowthDays =
    firstHolderSnapshot?.ts != null && latestHolders?.ts != null
      ? Math.max(
          1,
          Math.round((latestHolders.ts - firstHolderSnapshot.ts) / 86400),
        )
      : null;

  const launchValuation = p.raise_fdv_usd ?? null;

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
   * Summary = readable project / investment snapshot.
   *
   * The structure follows the research brief:
   * About → Market Performance → Raise Details & Commitments
   * → Token Economics → Project Health → Key Insights
   * → Recent Activity → Official Links & Resources.
   *
   * All displayed values are derived from the existing project data.
   */

  const summary = (
    <div className="space-y-10">
      {/* =====================================================
          ABOUT THE PROJECT
          Prose overview beside a quick-glance stat rail — the deep-dive
          numbers stay in their own sections below rather than repeating
          here, so this stays a summary rather than a second copy of them.
      ====================================================== */}

      <section>
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">
              About {p.name}
            </h2>
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              Project overview, current status and classification.
            </p>
            <p className="mt-3 text-[13px] leading-6 text-ink2">
              {summaryDescription}
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-2">
            <StatRowCard
              title="Snapshot"
              rows={[
                { label: "Status", value: p.status || "—" },
                { label: "Category", value: p.category || "—" },
                { label: "Token", value: p.symbol ?? p.name },
                {
                  label: "Health score",
                  value:
                    healthScoreValue != null ? `${healthScoreValue}/100` : "—",
                  sub: healthLabel,
                  tone: healthTone,
                },
              ]}
            />

            <StatRowCard
              title="Key metrics"
              rows={[
                { label: "Price", value: fmtUsd(latest?.price_usd) },
                { label: "Market cap", value: fmtUsd(latest?.mcap) },
                { label: "FDV", value: fmtUsd(latest?.fdv) },
                {
                  label: "Holders",
                  value:
                    latestHolders?.holder_count != null
                      ? fmtNum(latestHolders.holder_count)
                      : "—",
                },
              ]}
            />
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
            Current price, valuation, treasury strength, liquidity, trading
            activity and holder growth.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Current Price
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
              Current market valuation
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
              FDV
            </div>
            <div className="mt-1.5 text-[22px] font-semibold num text-ink">
              {fmtUsd(latest?.fdv)}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Fully diluted valuation
            </div>
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
            label="ROI vs Issue Price"
            value={roi != null ? fmtPct(roi) : NA}
            sub={
              rp
                ? `issue ${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`
                : "No issue price"
            }
          />
          <MetricCell
            label="Treasury Balance"
            value={
              treasuryValue != null && treasuryValue < 1
                ? "~$0"
                : fmtUsd(treasuryValue)
            }
            sub={
              treasuryBackingPct != null
                ? `${treasuryBackingPct.toFixed(0)}% of market cap`
                : "On-chain treasury"
            }
          />
          <MetricCell
            label="Liquidity"
            value={fmtUsd(latest?.liquidity_usd)}
            sub={
              liquidityPct != null
                ? `${liquidityPct.toFixed(0)}% of market cap`
                : liquidityLabel
            }
          />
          <MetricCell
            label="Total Holders"
            value={
              latestHolders?.holder_count != null
                ? fmtNum(latestHolders.holder_count)
                : NA
            }
            sub={
              holderGrowthPct != null
                ? `${fmtPct(holderGrowthPct)} over ${holderGrowthDays ?? "—"} days`
                : "Current holders"
            }
          />
        </div>
      </section>

      {/* =====================================================
          RAISE DETAILS & COMMITMENTS
      ====================================================== */}

      {(targetRaise != null ||
        committedRaise != null ||
        acceptedRaise != null ||
        rp != null ||
        p.raise_contributors != null) && (
        <section>
          <div className="max-w-3xl">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">
              Raise Details &amp; Commitments
            </h2>
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              Funding target, accepted raise, commitment demand and participant
              activity.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCell
              label="Target Raise"
              value={targetRaise != null ? fmtUsd(targetRaise) : NA}
              sub={
                p.raise_end_ts
                  ? `closed ${fmtDate(p.raise_end_ts)}`
                  : "Raise target"
              }
            />
            <MetricCell
              label="Total Committed"
              value={committedRaise != null ? fmtUsd(committedRaise) : NA}
              sub={
                oversubscriptionSummary != null
                  ? `${oversubscriptionSummary.toFixed(1)}× oversubscribed`
                  : "Total demand"
              }
            />
            <MetricCell
              label="Issue Price"
              value={rp ? `${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}` : NA}
              sub={rp?.derived ? "Derived from raise data" : "Launch price"}
            />
            <MetricCell
              label="Contributors"
              value={
                p.raise_contributors != null ? fmtNum(p.raise_contributors) : NA
              }
              sub="Raise participants"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <MetricCell
              label="Accepted Raise"
              value={acceptedRaise != null ? fmtUsd(acceptedRaise) : NA}
              sub={
                p.raise_end_ts
                  ? `closed ${fmtDate(p.raise_end_ts)}`
                  : "Accepted capital"
              }
            />
            <MetricCell
              label="Oversubscription"
              value={
                oversubscriptionSummary != null
                  ? `${oversubscriptionSummary.toFixed(1)}×`
                  : NA
              }
              sub="Committed vs accepted"
            />
            <MetricCell
              label="Refunds"
              value={refundPct != null ? `${refundPct.toFixed(0)}%` : NA}
              sub="Estimated commitments refunded"
            />
          </div>

          {p.raise_note && (
            <div className="mt-4 rounded-xl border border-line bg-surface2/30 p-4">
              <div className="text-[11px] font-semibold text-ink">
                Raise Context
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-ink2">
                {p.raise_note}
              </p>
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          TOKEN ECONOMICS
      ====================================================== */}

      {(p.total_supply != null ||
        p.circulating_supply != null ||
        p.team_package != null ||
        launchValuation != null) && (
        <section>
          <div className="max-w-3xl">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">
              Token Economics
            </h2>
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              Token supply, circulating allocation, team lockup and launch
              valuation.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCell
              label="Total Supply"
              value={p.total_supply != null ? fmtNum(p.total_supply) : NA}
            />
            <MetricCell
              label="Circulating Supply"
              value={
                p.circulating_supply != null ? fmtNum(p.circulating_supply) : NA
              }
              sub={
                p.circulating_supply != null && p.total_supply
                  ? `${((p.circulating_supply / p.total_supply) * 100).toFixed(1)}% circulating`
                  : undefined
              }
            />
            <MetricCell
              label="Team Locked"
              value={lockedPct != null ? `${lockedPct.toFixed(1)}%` : NA}
              sub={
                p.team_package != null
                  ? `${fmtNum(p.team_package)} tokens`
                  : undefined
              }
            />
            <MetricCell
              label="Launch Valuation"
              value={launchValuation != null ? fmtUsd(launchValuation) : NA}
              sub="Raise valuation"
            />
          </div>
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
            Combined assessment based on the project's available market,
            treasury, holder, development and risk data.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCell
            label="Health Score"
            value={healthScoreValue != null ? `${healthScoreValue}/100` : NA}
            sub={healthLabel}
          />
          <MetricCell
            label="Development"
            value={devScore.overall != null ? `${devScore.overall}/100` : NA}
            sub={p.github ? "GitHub activity" : "No GitHub linked"}
          />
          <MetricCell
            label="Holders"
            value={
              latestHolders?.holder_count != null
                ? fmtNum(latestHolders.holder_count)
                : NA
            }
            sub={
              holderGrowthPct != null
                ? `${fmtPct(holderGrowthPct)} growth`
                : "Current holder count"
            }
          />
          <MetricCell
            label="Liquidity"
            value={
              latest?.liquidity_usd != null ? fmtUsd(latest.liquidity_usd) : NA
            }
            sub={liquidityLabel}
          />
        </div>

        <div className="mt-4 rounded-xl border border-line bg-surface2/30 p-4">
          <div className="text-[12px] font-semibold text-ink">Assessment</div>
          <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-ink2">
            {healthScoreValue == null
              ? "There is not enough current data to produce a reliable health assessment."
              : healthScoreValue >= 80
                ? `The project currently shows strong overall health with a score of ${healthScoreValue}/100 across the available signals.`
                : healthScoreValue >= 60
                  ? `The project currently shows moderate overall health with a score of ${healthScoreValue}/100. Risk, treasury, holder and development data should be reviewed for additional context.`
                  : "The current data indicates areas that require additional attention. The project's risk, treasury, holder and development signals should be reviewed carefully."}
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
            Important signals derived from the project's price, raise, treasury,
            holder and market activity.
          </p>
        </div>

        <div className="mt-5">
          {topSignals.length ? (
            <SectionCard
              title="Latest Signals"
              subtitle={`${signals.length} signal${signals.length === 1 ? "" : "s"} detected from the available project data.`}
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
            Latest notable project events, including launches, listings,
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
          OFFICIAL LINKS & RESOURCES
      ====================================================== */}

      <section>
        <div className="max-w-3xl">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">
            Official Links &amp; Resources
          </h2>
          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            Official project websites, social channels and public references.
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
