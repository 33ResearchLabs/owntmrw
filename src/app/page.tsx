import Link from "next/link";
import { screenerRows, explorerRows, globalTimeline, allObservations } from "@/lib/queries";
import { ProjectCard } from "@/components/ProjectCard";
import { TokenTicker } from "@/components/TokenTicker";
import { ExplorerTable } from "@/components/ExplorerTable";
import { IntelligenceSection, pickFeatured } from "@/components/IntelligenceSection";
import { ResearchSection } from "@/components/ResearchSection";
import { scoreboard } from "@/lib/scoreboard";
import { PerformanceSection, TreasurySection, DevelopmentSection } from "@/components/HomeSections";
import { homeAggregates } from "@/lib/aggregates";
import { PortfolioCard } from "@/components/PortfolioCard";
import { FaqSection } from "@/components/FaqSection";
import { Logo } from "@/components/ui";
import { fmtUsd, fmtNum, fmtPct, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const rows = await screenerRows();
  const totalMcap = rows.reduce((s, r) => s + (r.mcap ?? 0), 0);
  const totalRaised = rows.reduce((s, r) => s + (r.raise_amount_usd ?? 0), 0);
  const totalVol = rows.reduce((s, r) => s + (r.vol24h ?? 0), 0);

  const newest = [...rows]
    .filter((r) => r.launch_ts && r.mcap)
    .sort((a, b) => (b.launch_ts ?? 0) - (a.launch_ts ?? 0))
    .slice(0, 3);

  const movers = [...rows]
    .filter((r) => r.change_24h != null && (r.liquidity_usd ?? 0) > 10_000)
    .sort((a, b) => Math.abs(b.change_24h ?? 0) - Math.abs(a.change_24h ?? 0))
    .slice(0, 6);

  const trending = [...rows]
    .filter((r) => r.vol24h != null)
    .sort((a, b) => (b.vol24h ?? 0) - (a.vol24h ?? 0))
    .slice(0, 5);

  // Every tracked token, biggest first, so the strip opens on names a reader
  // recognises rather than whatever sorted to the top.
  const ticker = [...rows]
    .filter((r) => r.price_usd != null)
    .sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0))
    .map((r) => ({
      slug: r.slug, name: r.name, symbol: r.symbol, image_url: r.image_url,
      price_usd: r.price_usd, change_24h: r.change_24h,
    }));

  const activity = globalTimeline(6);
  const signals = allObservations(4);

  const agg = homeAggregates();
  const totalLiq = rows.reduce((s, r) => s + (r.liquidity_usd ?? 0), 0);

  const featured = pickFeatured(rows);
  const board = await scoreboard(rows, featured?.slug ?? null);

  // Flattened here rather than in the table: only these fields cross into the
  // client bundle, and the volume windows arrive nested.
  const explorer = (await explorerRows()).map((r) => ({
    slug: r.slug, name: r.name, symbol: r.symbol,
    image_url: r.image_url, category: r.category,
    vol7d: r.vol7d.usd, vol7dTrend: r.vol7d.trend,
    vol30d: r.vol30d.usd, vol30dTrend: r.vol30d.trend,
    vol180d: r.vol180d.usd, vol180dTrend: r.vol180d.trend,
    // Which trends were measured by splitting the window rather than against a
    // full prior one, and over how many days — the cell marks and explains it.
    partial: {
      vol7dTrend: r.vol7d.trendPartial, vol30dTrend: r.vol30d.trendPartial,
      vol180dTrend: r.vol180d.trendPartial,
    },
    trendDays: {
      vol7dTrend: r.vol7d.trendDays, vol30dTrend: r.vol30d.trendDays,
      vol180dTrend: r.vol180d.trendDays,
    },
    mcap: r.mcap, liquidity_usd: r.liquidity_usd,
    treasury_usd: r.treasury_usd, holder_count: r.holder_count,
    candleDays: r.candleDays,
  }));

  return (
    /*
     * Two columns down to Top Movers, then full width.
     *
     * The rail is a companion to the market boards above it — most traded,
     * live activity, signals — and it ends there. Everything below is a wide
     * table or a two-up card grid, and all of it was being squeezed into two
     * thirds of the page to leave room for a column that had already stopped.
     */
    <div className="ml-10 space-y-10 md:space-y-14 lg:space-y-16">
      {/*
       * One section rhythm, applied at all three levels it can appear at: the
       * full-width sections below, this column's own sections, and the gap
       * around the two-column block — so the rail, which sits below the column
       * until `xl`, is spaced like another section rather than tucked against
       * the last one. At `xl` that gap becomes the horizontal gutter beside the
       * rail, so it alone resets there.
       */}
      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16 xl:flex-row xl:gap-6">
        <div className="min-w-0 flex-1 space-y-10 md:space-y-14 lg:space-y-16">
          {/* hero */}
          {/* Padding is deliberately asymmetric — the plate's own vertical wash
              darkens toward the foot, so an equal `pb` reads as heavier than
              the `pt` above it. The pair is tuned to land the panel near the
              height of the Most Traded card beside it rather than overshooting
              it by a third, which is what the old pt-12/pb-16 did. */}
          {/* `mb-4` opts this one gap out of the column's section rhythm to
              match the rail's own `space-y-4`, so the market strip starts level
              with Live Activity instead of a section-gap below it. It overrides
              the rhythm rather than fighting it: Tailwind's `space-y-*` sets
              `margin-block-end` on every child but the last from inside a
              zero-specificity `:where()`, which any margin utility outranks. */}
          <section className="hero hero-banner mb-4 px-10 pb-9 pt-8">
            <div className="hero-glow" />
            <h1 className="relative m-0 text-[64px] font-extrabold leading-[1.02] tracking-[-0.03em]">
              Own<br />Tomorrow<span className="text-accent">.</span>
            </h1>
            <p className="relative mt-5 max-w-[400px] text-[16.5px] leading-relaxed text-ink2">
              Trade tomorrow&apos;s companies, today.<br />
              The public market for private innovation.
            </p>
            <div className="relative mt-6 flex flex-wrap gap-3">
              <Link href="/screener" className="btn-primary">Explore markets</Link>
              <Link href="/timeline" className="btn-ghost">
                <span className="text-[11px]">▶</span> Live activity
              </Link>
            </div>
          </section>

          {/* market strip */}
          {/* Shadow is inline because Tailwind will not emit an arbitrary
              box-shadow whose spread is negative — `shadow-[…_-22px_…]` silently
              produces no rule at all. */}
          <div
            className="card flex flex-col gap-6 px-6 py-6 sm:px-8 md:flex-row md:items-center md:gap-8"
            style={{ boxShadow: "0 14px 36px -22px rgba(0, 0, 0, 0.95)" }}
          >
            <div className="grid flex-1 grid-cols-2 gap-y-6 sm:grid-cols-4">
              {([
                ["Markets", String(rows.length)],
                ["Combined cap", fmtUsd(totalMcap)],
                ["24h volume", fmtUsd(totalVol)],
                ["Capital raised", fmtUsd(totalRaised)],
              ] as const).map(([k, v], i) => (
                <div
                  key={k}
                  // The rule sits on the cell that follows a divide, so it tracks
                  // the column count: every cell but the first at 4-up, and only
                  // the right-hand cell of each row at 2-up.
                  className={`min-w-0 ${i % 2 === 1 ? "border-l border-line pl-5" : ""} ${
                    i > 0 ? "sm:border-l sm:border-line sm:pl-6" : "sm:border-l-0 sm:pl-0"
                  }`}
                >
                  <div className="text-[10.5px] uppercase tracking-[0.11em] text-faint">{k}</div>
                  <div className="num mt-2 text-[22px] font-extrabold leading-none tracking-tight">{v}</div>
                </div>
              ))}
            </div>
            <Link
              href="/screener"
              className="group inline-flex shrink-0 items-center gap-2 self-start text-[13.5px] font-medium text-ink2 transition-colors duration-150 hover:text-accent md:ml-auto md:self-auto"
            >
              Full screener
              <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
            </Link>
          </div>

          {/* The price strip belongs to Just Launched rather than standing on
              its own: grouped, the two set their own 16px rhythm instead of
              inheriting the page's 32px section gap on both sides of a 40px
              band.

              The gap above is set inline, and as `margin-block-start` rather
              than `margin-top`: `space-y-8` on the parent sets the logical
              property, so a physical `margin-top` — utility or inline — does
              not override it and the strip keeps the full section gap. */}
          <div className="space-y-4" style={{ marginBlockStart: "1rem" }}>
            <TokenTicker tokens={ticker} />

            {/* newest */}
            {newest.length > 0 && (
              <section>
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="flex items-center gap-2 text-[18px] font-bold">
                    <span className="text-accent">⚡</span> Just Launched
                  </h2>
                  <Link href="/screener" className="text-[12.5px] text-muted hover:text-ink">View all</Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {newest.map((r, i) => (
                    <ProjectCard
                      key={r.slug}
                      badge={i === 0 ? "NEW" : undefined}
                      p={{
                        slug: r.slug, name: r.name, symbol: r.symbol, category: r.category,
                        image_url: r.image_url, status: r.status,
                        price_usd: r.price_usd, mcap: r.mcap, change_24h: r.change_24h,
                        raise_amount_usd: r.raise_amount_usd, roi_since_raise: r.roi_since_raise,
                        holder_count: r.holder_count, treasury_usd: r.treasury_usd,
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* movers — a trading board, not a table */}
          {movers.length > 0 && (
            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-[18px] font-bold">Top Movers</h2>
                <span className="text-[12px] text-faint">24h · liquid markets only</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {movers.map((r) => {
                  const up = (r.change_24h ?? 0) >= 0;
                  return (
                    <Link
                      key={r.slug}
                      href={`/project/${r.slug}#trade`}
                      className="card lift flex items-center gap-3.5 px-4 py-3.5"
                    >
                      <Logo src={r.image_url} name={r.name} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-bold">{r.name}</div>
                        <div className="num text-[12px] text-muted">{fmtUsd(r.price_usd, { compact: false })}</div>
                      </div>
                      <div className="text-right">
                        <div className={`num text-[15px] font-extrabold ${up ? "text-good" : "text-bad"}`}>
                          {up ? "▲" : "▼"} {fmtPct(r.change_24h, false)}
                        </div>
                        <div className="num text-[11px] text-faint">{fmtUsd(r.vol24h)} vol</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* right rail — portfolio, trending, activity */}
        <aside className="w-full shrink-0 space-y-4 xl:w-[340px]">
          <PortfolioCard hideWhenDisconnected />

          {trending.length > 0 && (
            <div className="card px-5 pb-2.5 pt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[14.5px] font-bold">Most Traded</span>
                <Link href="/screener" className="text-[12px] text-faint hover:text-ink2">View all</Link>
              </div>
              {trending.map((r, i) => (
                <Link
                  key={r.slug}
                  href={`/project/${r.slug}#trade`}
                  className="flex items-center gap-3 border-t border-grid py-2.5"
                >
                  <span className="num w-3 text-[12.5px] text-faint">{i + 1}</span>
                  <Logo src={r.image_url} name={r.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                    <span className="num block text-[11px] text-faint">{fmtUsd(r.vol24h)} 24h</span>
                  </span>
                  <span className={`num text-[12.5px] font-bold ${(r.change_24h ?? 0) >= 0 ? "text-good" : "text-bad"}`}>
                    {fmtPct(r.change_24h)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {activity.length > 0 && (
            <div className="card px-5 pb-2.5 pt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14.5px] font-bold">
                  <span className="h-[7px] w-[7px] rounded-full bg-good pulse" />
                  Live Activity
                </span>
                <Link href="/timeline" className="text-[12px] text-faint hover:text-ink2">View all</Link>
              </div>
              {activity.map((e, i) => (
                <Link key={i} href={`/project/${e.slug}`} className="flex items-center gap-3 border-t border-grid py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{e.title}</span>
                    <span className="block text-[11px] text-faint">{e.name} · {timeAgo(e.ts)}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-surface2 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {e.type.replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {signals.length > 0 && (
            <div className="card px-5 pb-2.5 pt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[14.5px] font-bold">Signals</span>
                <Link href="/observations" className="text-[12px] text-faint hover:text-ink2">View all</Link>
              </div>
              {signals.map((o, i) => (
                <div key={i} className="border-t border-grid py-2.5 text-[12px] leading-relaxed text-ink2">
                  {o.name && <span className="font-semibold text-ink">{o.name} · </span>}
                  {o.text}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

        {/* site-wide roll-ups: the project-page sections, every project summed.
            Parked for now — the components and their aggregates stay in the
            tree so this is a one-line revert each. */}
        {/* <PerformanceSection
          agg={agg} mcapNow={totalMcap} liquidityNow={totalLiq} vol24h={totalVol}
        /> */}
        {/* <TreasurySection agg={agg} liquidityNow={totalLiq} /> */}
        {/* <DevelopmentSection agg={agg} /> */}

        {/* explorer — the screener's headline numbers, as a ranked board */}
        {explorer.length > 0 && (
          <ExplorerTable rows={explorer} />
        )}

        {/* what a project page holds, and how it is put together */}
        <IntelligenceSection featured={featured} />

        {/* how a score is built, and what it produces */}
        <ResearchSection board={board} />

        {/* banner */}
        <Link href="/screener" className="hero block px-10 pb-12 pt-10">
          <div className="hero-glow" />
          <h3 className="relative m-0 text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            The next generation<br />of great companies.
          </h3>
          <p className="relative mt-2.5 text-[14px] text-ink2">
            Discover. Trade. Own tomorrow.
          </p>
          <span className="relative mt-5 inline-block rounded-xl bg-page px-5 py-2.5 text-[13px] font-semibold">
            Explore now
          </span>
        </Link>

        {/* faq */}
        <FaqSection />
    </div>
  );
}
