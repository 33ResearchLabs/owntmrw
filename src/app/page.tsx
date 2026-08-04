import Link from "next/link";
import { screenerRows, globalTimeline, allObservations } from "@/lib/queries";
import { ProjectCard } from "@/components/ProjectCard";
import { PortfolioCard } from "@/components/PortfolioCard";
import { Logo } from "@/components/ui";
import { fmtUsd, fmtNum, fmtPct, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function Home() {
  const rows = screenerRows();
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

  const activity = globalTimeline(6);
  const signals = allObservations(4);

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-8">
        {/* hero */}
        <section className="hero px-10 pb-16 pt-12">
          <div className="hero-glow" />
          <h1 className="relative m-0 text-[64px] font-extrabold leading-[1.02] tracking-[-0.03em]">
            Own<br />Tomorrow<span className="text-accent">.</span>
          </h1>
          <p className="relative mt-6 max-w-[400px] text-[16.5px] leading-relaxed text-ink2">
            Trade tomorrow&apos;s companies, today.<br />
            The public market for private innovation.
          </p>
          <div className="relative mt-7 flex flex-wrap gap-3">
            <Link href="/screener" className="btn-primary">Explore markets</Link>
            <Link href="/timeline" className="btn-ghost">
              <span className="text-[11px]">▶</span> Live activity
            </Link>
          </div>
        </section>

        {/* market strip */}
        <div className="card flex flex-wrap items-center gap-x-9 gap-y-4 px-6 py-4">
          {([
            ["Markets", String(rows.length)],
            ["Combined cap", fmtUsd(totalMcap)],
            ["24h volume", fmtUsd(totalVol)],
            ["Capital raised", fmtUsd(totalRaised)],
          ] as const).map(([k, v]) => (
            <div key={k}>
              <div className="text-[10.5px] uppercase tracking-[0.09em] text-faint">{k}</div>
              <div className="num mt-0.5 text-[17px] font-extrabold tracking-tight">{v}</div>
            </div>
          ))}
          <Link href="/screener" className="ml-auto text-[12.5px] text-muted transition-colors hover:text-accent">
            Full screener →
          </Link>
        </div>

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
      </div>

      {/* right rail — portfolio, trending, activity */}
      <aside className="w-full shrink-0 space-y-4 xl:w-[340px]">
        <PortfolioCard />

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
  );
}
