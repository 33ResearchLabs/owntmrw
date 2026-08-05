import { notFound } from "next/navigation";
import {
  projectDetail, priceIsReliable, MIN_LIQUIDITY_USD, crossProjectHolderCounts,
  parseLanguages, parseCodeFrequency, parseRisks,
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
  ListingsPanel, RiskPanel, SectionCard, Metric, MetricGrid, CardLink, CardTag, DataGap,
} from "@/components/panels";
import { TradeTerminal } from "@/components/TradeTerminal";
import { PortfolioCard } from "@/components/PortfolioCard";
import { ProjectBrief } from "@/components/ProjectBrief";
import { Delta, Logo, StatTile, StatusBadge } from "@/components/ui";
import { fmtUsd, fmtNum, fmtPct, fmtDate, timeAgo, shortAddr } from "@/lib/format";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  raise_closed: "R", token_launch: "L", proposal: "P",
  github_release: "G", listing: "X", news: "N",
  whale_buy: "W", whale_sell: "W", unlock: "U", buyback: "B",
};

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await projectDetail(slug);
  if (!d) notFound();
  const {
    project: p, latest, candles, events, holderHistory, github, observations,
    treasuryValue, ath, athTs,
  } = d;

  const tradable = priceIsReliable(latest?.liquidity_usd);
  const roi = p.raise_price && latest?.price_usd && tradable
    ? ((latest.price_usd - p.raise_price) / p.raise_price) * 100 : null;
  const athReturn = p.raise_price && ath && tradable ? ((ath - p.raise_price) / p.raise_price) * 100 : null;
  const fromAth = ath && latest?.price_usd && tradable ? ((latest.price_usd - ath) / ath) * 100 : null;
  const daysToAth = athTs && (p.raise_end_ts || p.launch_ts)
    ? Math.max(0, Math.round((athTs - (p.raise_end_ts ?? p.launch_ts!)) / 86400)) : null;
  const latestHolders = holderHistory.length ? holderHistory[holderHistory.length - 1] : null;
  const refunded = p.raise_committed_usd && p.raise_amount_usd
    ? (1 - p.raise_amount_usd / p.raise_committed_usd) * 100 : null;
  const oversubscribed = p.raise_committed_usd && p.raise_amount_usd
    ? p.raise_committed_usd / p.raise_amount_usd : null;
  const lockedPct = p.team_package && p.total_supply
    ? (p.team_package / p.total_supply) * 100 : null;

  const hs = healthScore(d);
  const signals = insights(d);
  const devScore = developerScore(github, !!p.github);
  const languages = parseLanguages(github);
  const codeFrequency = parseCodeFrequency(github);
  const memo = buildMemo(d);
  const crossCounts = crossProjectHolderCounts();

  const chartEvents = events.map((e) => ({
    time: e.ts, label: EVENT_LABEL[e.type] ?? "•", title: e.title, type: e.type, detail: e.detail,
  }));

  const links: [string, string | null][] = [
    ["Website", p.website], ["X", p.twitter], ["Discord", p.discord],
    ["Telegram", p.telegram], ["GitHub", p.github], ["Docs", p.docs],
  ];

  const chartBlock = (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[14px] font-semibold">
          {p.symbol ?? p.name}<span className="text-muted"> / USD</span>
        </h2>
        <span className="text-[11px] text-muted">quoted in USD</span>
      </div>
      <PriceChart candles={candles} events={chartEvents} slug={slug} />
    </section>
  );

  const overview = (
    <div className="space-y-5">
      <HealthScorePanel hs={hs} updatedTs={p.updated_ts} />
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="AI Insights" right={<span className="text-[11px] text-muted">{signals.length} signal{signals.length === 1 ? "" : "s"}</span>}>
          <InsightList items={signals} />
        </SectionCard>
        <SectionCard
          title="Development"
          right={<a href="#development" className="text-[11px] text-accent hover:underline">full breakdown →</a>}
        >
          {github ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-4">
              <Metric label="Commits 90d" value={fmtNum(github.commits_90d)} />
              <Metric label="Contributors" value={fmtNum(github.contributors)} />
              <Metric label="Stars" value={fmtNum(github.stars)} />
              <Metric label="Last Commit" value={timeAgo(github.last_commit_ts ?? github.last_push_ts)} />
            </div>
          ) : (
            <div className="p-4">
              <DataGap
                title="No GitHub organisation linked"
                why="Engineering output cannot be verified for this project because no public repository is recorded."
              />
            </div>
          )}
        </SectionCard>
      </div>
      <RiskPanel risk={d.risk} flags={parseRisks(d.risk)} />
      <ListingsPanel listings={d.listings} />
      <CompareRaisePanel d={d} />
      {(p.raise_amount_usd != null || p.raise_price != null || p.circulating_supply != null || p.raise_note != null) && (
        <SectionCard
          title="Raise & Supply"
          size="lg"
          right={
            <div className="flex flex-wrap items-center gap-2">
              {p.raise_track && <CardTag>{p.raise_track}</CardTag>}
              {p.raise_source_url && <CardLink href={p.raise_source_url}>View details</CardLink>}
            </div>
          }
        >
          <MetricGrid>
            <Metric
              size="lg"
              label="Raised"
              value={p.raise_amount_usd === 0 ? "$0" : fmtUsd(p.raise_amount_usd)}
              sub={p.raise_amount_usd === 0 ? "fully refunded" : undefined}
            />
            <Metric size="lg" label="Minimum / Goal" value={fmtUsd(p.raise_goal_usd)} />
            <Metric
              size="lg"
              label="Committed"
              value={fmtUsd(p.raise_committed_usd)}
              sub={oversubscribed != null
                ? `${oversubscribed < 10 ? oversubscribed.toFixed(1) : Math.round(oversubscribed)}× oversubscribed · ${refunded!.toFixed(0)}% refunded`
                : undefined}
            />
            <Metric size="lg" label="Raise Price" value={p.raise_price != null ? fmtUsd(p.raise_price, { compact: false }) : "—"} />
            <Metric size="lg" label="Raise FDV" value={fmtUsd(p.raise_fdv_usd)} />
            <Metric size="lg" label="Contributors" value={fmtNum(p.raise_contributors)} />
            <Metric
              size="lg"
              label="Circulating Supply"
              value={fmtNum(p.circulating_supply)}
              sub={p.total_supply ? `of ${fmtNum(p.total_supply)} total` : undefined}
            />
            <Metric
              size="lg"
              label="Locked (Team)"
              value={fmtNum(p.team_package)}
              sub={lockedPct != null ? `${lockedPct.toFixed(0)}% of supply` : undefined}
            />
          </MetricGrid>
          {p.raise_note && (
            <div className="border-t border-grid px-5 py-4 sm:px-6 sm:py-5">
              <p className="rounded-xl border border-line bg-surface2 px-4 py-4 text-[12.5px] leading-relaxed text-ink2 sm:px-5">
                {p.raise_note}
              </p>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );

  const tabs: TabDef[] = [
    { key: "overview", label: "Overview", content: overview },
    { key: "holders", label: "Holders", badge: latestHolders?.holder_count ? fmtNum(latestHolders.holder_count) : undefined, content: <HoldersPanel d={d} crossCounts={crossCounts} /> },
    { key: "smart", label: "Smart Money", content: <SmartMoneyPanel d={d} /> },
    { key: "treasury", label: "Treasury", content: <TreasuryPanel d={d} /> },
    {
      key: "development", label: "Development",
      badge: devScore.overall ?? undefined,
      content: (
        <DevelopmentPanel
          github={github} languages={languages} codeFrequency={codeFrequency}
          score={devScore} githubUrl={p.github} releaseCount={d.releases.length}
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
              <a key={label} href={url!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
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
        <StatTile
          label="ROI vs Raise" value={<Delta v={roi} />}
          sub={p.raise_price != null ? `from ${fmtUsd(p.raise_price, { compact: false })}` : "raise price unknown"}
        />
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
          <SectionCard title="Market Depth & Risk">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-3">
              <Metric label="Liquidity" value={fmtUsd(latest?.liquidity_usd)} sub="pool depth, USD" />
              <Metric label="24h Volume" value={fmtUsd(latest?.vol24h)} />
              <Metric
                label="Volume / Depth"
                value={latest?.vol24h && latest.liquidity_usd ? `${(latest.vol24h / latest.liquidity_usd).toFixed(2)}×` : "—"}
                sub="turnover ratio"
              />
              <Metric label="Market Cap" value={fmtUsd(latest?.mcap)} sub="circulating supply" />
              <Metric label="FDV" value={fmtUsd(latest?.fdv)} sub="total supply" />
              <Metric
                label="Tradeable Float"
                value={p.circulating_supply && p.total_supply ? `${((p.circulating_supply / p.total_supply) * 100).toFixed(0)}%` : "—"}
                sub="of total supply"
              />
            </div>
          </SectionCard>
        </div>
        <div id="trade" className="scroll-mt-20">
          <div className="card sticky top-[76px] overflow-hidden">
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

      {/* research tabs */}
      <div className="flex gap-5">
        <div className="min-w-0 flex-1">
          <Tabs tabs={tabs} />
        </div>
        <aside className="hidden w-[300px] shrink-0 xl:block">
          <div className="space-y-4">
            <PortfolioCard />
            {observations.length > 0 && (
              <div className="card">
                <div className="border-b border-grid px-4 py-3">
                  <h3 className="text-[14px] font-semibold">Latest Signals</h3>
                </div>
                <ul className="divide-y divide-grid">
                  {observations.slice(0, 5).map((o, i) => (
                    <li key={i} className="px-4 py-2.5 text-[12px] leading-relaxed text-ink2">{o.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
