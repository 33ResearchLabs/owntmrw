import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import {
  projectDetail, priceIsReliable, MIN_LIQUIDITY_USD,
  parseLanguages, parseCodeFrequency, parseRisks, raisePriceOf, tradingStart,
  periodReturns,
} from "@/lib/queries";
import { healthScore, insights, developerScore } from "@/lib/analytics";
import { DevelopmentPanel } from "@/components/Development";
import { buildMemo } from "@/lib/research";
import { PriceChart } from "@/components/PriceChart";
import { Tabs, type TabDef } from "@/components/Tabs";
import { HealthScorePanel } from "@/components/HealthScore";
import {
  HoldersPanel, SmartMoneyPanel, TreasuryPanel, CompareRaisePanel, NewsPanel,
  ResearchPanel, GovernancePanel, TimelinePanel, InsightList,
  ListingsPanel, RiskPanel, SectionCard, Metric,
  DashboardCard, CardAction, CardTag, MetricGrid, MetricCell, CardNote,
} from "@/components/panels";
import { TradeTerminal } from "@/components/TradeTerminal";
import { PortfolioCard } from "@/components/PortfolioCard";
import { ProjectBrief } from "@/components/ProjectBrief";
import { MarketDepthPanel } from "@/components/MarketDepth";
import { Delta, Logo, StatTile, StatusBadge } from "@/components/ui";
import { fmtUsd, fmtPrice, fmtNum, fmtPct, fmtDate, shortAddr } from "@/lib/format";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  raise_closed: "R", token_launch: "L", proposal: "P",
  github_release: "G", listing: "X", news: "N",
  whale_buy: "W", whale_sell: "W", unlock: "U", buyback: "B",
};

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // The real gate. `proxy.ts` only saw that a cookie existed; this is where
  // a forged or expired one is turned away.
  await requireSession(`/project/${slug}`);

  const d = await projectDetail(slug);
  if (!d) notFound();
  const {
    project: p, latest, candles, events, holderHistory, github,
    treasuryValue, ath, athTs,
  } = d;

  // The clock is read once, here, so the panels that take it stay pure and
  // their period-over-period deltas are reproducible from their inputs. This
  // page is force-dynamic and renders once per request, which is the one place
  // reading the time is correct.
  // eslint-disable-next-line react-hooks/purity
  const nowSec = Math.floor(Date.now() / 1000);

  const tradable = priceIsReliable(latest?.liquidity_usd);
  const rp = raisePriceOf(p);
  const roi = rp && latest?.price_usd && tradable
    ? ((latest.price_usd - rp.usd) / rp.usd) * 100 : null;
  const athReturn = rp && ath && tradable ? ((ath - rp.usd) / rp.usd) * 100 : null;
  const fromAth = ath && latest?.price_usd && tradable ? ((latest.price_usd - ath) / ath) * 100 : null;
  const tradingFrom = tradingStart(p, candles);
  const periods = periodReturns(candles, latest?.price_usd ?? null, nowSec);
  const daysToAth = athTs && tradingFrom
    ? Math.max(0, Math.round((athTs - tradingFrom) / 86400)) : null;
  const latestHolders = holderHistory.length ? holderHistory[holderHistory.length - 1] : null;
  const refunded = p.raise_committed_usd && p.raise_amount_usd
    ? (1 - p.raise_amount_usd / p.raise_committed_usd) * 100 : null;
  const oversubscribed = p.raise_committed_usd && p.raise_amount_usd
    ? p.raise_committed_usd / p.raise_amount_usd : null;
  const lockedPct = p.team_package && p.total_supply
    ? (p.team_package / p.total_supply) * 100 : null;

  const hs = healthScore(d);
  // Freshness stamp for the health panel: the newest of the snapshot streams the
  // score actually reads from. Display only — nothing here feeds `healthScore`.
  const hsUpdatedAt = Math.max(
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
    time: e.ts, label: EVENT_LABEL[e.type] ?? "•", title: e.title, type: e.type, detail: e.detail,
  }));

  const links: [string, string | null][] = [
    ["Website", p.website], ["X", p.twitter], ["Discord", p.discord],
    ["Telegram", p.telegram], ["GitHub", p.github], ["Docs", p.docs],
  ];

  const chartBlock = (
    // The pair label, price and market figures now live inside the chart card's
    // own header, so this section is the frame and nothing else.
    <section className="card p-4 sm:p-5">
      <PriceChart
        candles={candles} events={chartEvents} slug={slug}
        circulatingSupply={p.circulating_supply}
        name={p.name}
        symbol={p.symbol ?? p.name}
        imageUrl={p.image_url}
        marketCap={latest?.mcap ?? null}
        volume24h={latest?.vol24h ?? null}
        change24h={latest?.change_24h ?? null}
        periods={periods}
        // Freshness of the series on screen, which is the newest bar we hold.
        lastUpdated={candles.length ? candles[candles.length - 1].ts : null}
      />
    </section>
  );

  const overview = (
    <div className="space-y-5">
      <HealthScorePanel hs={hs} updatedAt={hsUpdatedAt} />
      <CompareRaisePanel d={d} />
      <RiskPanel risk={d.risk} flags={parseRisks(d.risk)} />
      <SectionCard
        title="AI Insights"
        subtitle="Notable movements picked out of this project's own price, holder and treasury data."
        right={<span className="text-[11px] text-muted">{signals.length} signal{signals.length === 1 ? "" : "s"}</span>}
      >
        <InsightList items={signals} />
      </SectionCard>
      {/* The Treasury and Development summaries used to sit here. They are the
          same cards their own tabs open with, so the overview was repeating
          two full sections a click away — dropped rather than duplicated. */}
      <ListingsPanel listings={d.listings} />
      {(p.raise_amount_usd != null || rp != null || p.circulating_supply != null || p.raise_note != null) && (
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
            {p.raise_amount_usd != null && (
              <MetricCell
                label="Raised"
                value={p.raise_amount_usd === 0 ? "$0" : fmtUsd(p.raise_amount_usd)}
                sub={
                  p.raise_amount_usd === 0
                    ? "fully refunded"
                    : p.raise_end_ts ? `closed ${fmtDate(p.raise_end_ts)}` : undefined
                }
              />
            )}
            {p.raise_goal_usd != null && (
              <MetricCell label="Minimum / Goal" value={fmtUsd(p.raise_goal_usd)} />
            )}
            {p.raise_committed_usd != null && (
              <MetricCell
                label="Committed"
                value={fmtUsd(p.raise_committed_usd)}
                sub={
                  oversubscribed != null
                    ? `${oversubscribed < 10 ? oversubscribed.toFixed(1) : Math.round(oversubscribed)}× oversubscribed · ${refunded!.toFixed(0)}% refunded`
                    : undefined
                }
              />
            )}
            {rp && (
              <MetricCell
                label="Raise Price"
                value={`${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`}
                sub={rp.derived ? "derived: raise ÷ 10M tokens sold" : undefined}
              />
            )}
            {p.raise_fdv_usd != null && <MetricCell label="Raise FDV" value={fmtUsd(p.raise_fdv_usd)} />}
            {p.raise_contributors != null && (
              <MetricCell label="Contributors" value={fmtNum(p.raise_contributors)} />
            )}
            {p.circulating_supply != null && (
              <MetricCell
                label="Circulating Supply"
                value={fmtNum(p.circulating_supply)}
                sub={p.total_supply ? `of ${fmtNum(p.total_supply)} total` : undefined}
              />
            )}
            {p.team_package != null && (
              <MetricCell
                label="Locked (Team)"
                value={fmtNum(p.team_package)}
                sub={lockedPct != null ? `${lockedPct.toFixed(0)}% of supply` : undefined}
              />
            )}
          </MetricGrid>
          {p.raise_note && <CardNote>{p.raise_note}</CardNote>}
        </DashboardCard>
      )}
    </div>
  );

  const tabs: TabDef[] = [
    { key: "overview", label: "Overview", content: overview },
    { key: "holders", label: "Holders", badge: latestHolders?.holder_count ? fmtNum(latestHolders.holder_count) : undefined, content: <HoldersPanel d={d} /> },
    { key: "smart", label: "Smart Money", content: <SmartMoneyPanel d={d} /> },
    { key: "treasury", label: "Treasury", content: <TreasuryPanel d={d} nowSec={nowSec} /> },
    {
      key: "development", label: "Development",
      badge: devScore.overall ?? undefined,
      content: (
        <DevelopmentPanel
          github={github} languages={languages} codeFrequency={codeFrequency}
          score={devScore} githubUrl={p.github} releaseCount={d.releases.length}
          recentCommits={d.recentCommits}
        />
      ),
    },
    { key: "governance", label: "Governance", badge: d.proposals.length || undefined, content: <GovernancePanel d={d} /> },
    { key: "timeline", label: "Timeline", badge: events.length || undefined, content: <TimelinePanel events={events} /> },
    {
      key: "news", label: "News",
      // Counts real news only — git tags used to inflate this badge to 17 on a
      // project with no press coverage at all.
      badge: d.news.length || undefined,
      content: <NewsPanel items={d.news} releases={d.releases} project={p} />,
    },
    { key: "research", label: "Research", content: <ResearchPanel memo={memo} /> },
  ];

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start gap-4">
        <Logo src={p.image_url} name={p.name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-tight">{p.name}</h1>
            {p.symbol && <span className="text-[14px] text-muted">{p.symbol}</span>}
            <StatusBadge status={p.status} />
            {p.category && <span className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] text-ink2">{p.category}</span>}
            {hs.overall != null && (
              <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink2">
                Health <span className="num font-semibold text-ink">{hs.overall}</span>/100
              </span>
            )}
          </div>
          {p.description && (
            <p className="mt-1 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-ink2">
              {p.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
            {links.filter(([, url]) => url).map(([label, url]) => (
              <a key={label} href={url!} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                {label} ↗
              </a>
            ))}
            {p.mint && (
              <a
                href={`https://solscan.io/token/${p.mint}`} target="_blank" rel="noopener noreferrer"
                className="num text-muted hover:text-ink2" title={p.mint}
              >
                {shortAddr(p.mint)} ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {latest?.price_usd != null && !tradable && (
        <div className="rounded-md border border-warn/40 bg-warn/5 px-4 py-2.5 text-[12px] text-ink2">
          <span className="font-medium text-warn">Thin liquidity.</span>{" "}
          This market holds {fmtUsd(latest.liquidity_usd)} of liquidity — below the{" "}
          {fmtUsd(MIN_LIQUIDITY_USD)} threshold where a quoted price reflects what the market
          would actually pay. Return metrics are withheld rather than computed from an unreliable price.
        </div>
      )}

      {/* market stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Price" value={fmtUsd(latest?.price_usd)} sub={<Delta v={latest?.change_24h} />} />
        <StatTile label="Market Cap" value={fmtUsd(latest?.mcap)} sub={`FDV ${fmtUsd(latest?.fdv)}`} />
        <StatTile label="Liquidity" value={fmtUsd(latest?.liquidity_usd)} sub={`Vol 24h ${fmtUsd(latest?.vol24h)}`} />
        <StatTile
          label="Treasury"
          value={treasuryValue != null && treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue)}
          sub={
            treasuryValue != null && treasuryValue < 1
              ? "DAO USDC vault is empty"
              : p.raise_amount_usd != null ? `raised ${fmtUsd(p.raise_amount_usd)}` : "USDC AUM (on-chain)"
          }
        />
        {/* A return needs a price to measure from. Where none exists — MetaDAO
            raised privately, so no per-token price was ever published — the
            tile carries the raise itself rather than an empty percentage that
            reads as a load failure. */}
        {roi != null || rp ? (
          <StatTile
            label="ROI vs Raise" value={<Delta v={roi} />}
            sub={rp ? `from ${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}` : undefined}
          />
        ) : (
          <StatTile
            label="Raised"
            value={p.raise_amount_usd != null ? fmtUsd(p.raise_amount_usd) : "—"}
            sub={
              p.raise_amount_usd == null ? "no raise on record"
                : p.raise_track ? `${p.raise_track} launch · no ROI baseline`
                  : "private round · no public token price"
            }
          />
        )}
        <StatTile
          label="From ATH" value={<Delta v={fromAth} />}
          sub={
            athReturn != null ? `peak ${fmtPct(athReturn)} vs raise`
              : daysToAth != null ? `ATH in ${daysToAth}d`
                : athTs ? `ATH ${fmtDate(athTs)}` : undefined
          }
        />
      </div>

      {/* trading floor: chart + order panel always visible */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {chartBlock}
          <MarketDepthPanel d={d} nowSec={nowSec} />
        </div>
        <div id="trade">
          <div className="card sticky top-[calc(var(--nav-h)+20px)] overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-grid px-4 py-3">
              <h2 className="text-[14px] font-semibold">Trade {p.symbol ?? p.name}</h2>
              <span className="num text-[12px] text-muted">{fmtUsd(latest?.price_usd, { compact: false })}</span>
            </div>
            <div className="px-4 py-4">
              <TradeTerminal
                symbol={p.symbol ?? p.name} mint={p.mint}
                price={latest?.price_usd ?? null}
                liquidity={latest?.liquidity_usd ?? null}
                vol24h={latest?.vol24h ?? null}
              />
            </div>
          </div>
        </div>
      </div>

      {/* readable brief — everything, in plain rows */}
      <ProjectBrief d={d} />

      {/* research tabs — full width. The Latest Signals rail that used to take
          300px of this row at `xl` is gone, and with it the flex wrapper that
          existed only to seat the two side by side. */}
      <Tabs tabs={tabs} />
    </div>
  );
}
