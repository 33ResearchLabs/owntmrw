import Link from "next/link";
import type { HomeAggregates } from "@/lib/aggregates";
import { TrendSectionHeader, TrendCard } from "./viz";
import { Logo } from "./ui";
import { fmtUsd, fmtNum, timeAgo } from "@/lib/format";

/**
 * Three site-wide roll-up sections for the home page, built from the same
 * `TrendSectionHeader` + `TrendCard` the project page already uses. The
 * project pages answer "how is this one doing"; these answer the same
 * questions with every tracked project summed together.
 *
 * Reusing those two rather than new primitives is deliberate: the eyebrow tag,
 * heading scale and card anatomy are already settled, and a second set drawn
 * to a mock-up would have put two card designs on one site.
 */

/**
 * What a combined delta is measured over.
 *
 * Not simply "vs 120d ago": `changePct` spans only the run where the number of
 * reporting projects held steady, so the label has to name that run or it
 * claims a comparison the figure did not make. With no such run, it says how
 * thin the history is instead.
 */
function changeNote(s: { changePct: number | null; changeDays: number; days: number }) {
  if (s.changePct == null) return `${s.days} day${s.days === 1 ? "" : "s"} on file`;
  return s.changeDays === 1 ? "vs previous read" : `over ${s.changeDays} days`;
}

// ------------------------------------------------------- performance

export function PerformanceSection({
  agg, mcapNow, liquidityNow, vol24h,
}: {
  agg: HomeAggregates;
  /** Live combined figures, so these agree with the strip at the top of the
   *  page rather than quoting the last daily close against it. */
  mcapNow: number;
  liquidityNow: number;
  vol24h: number;
}) {
  if (!agg.mcap.series.length) return null;
  // What every project is worth now against what all of them raised — the one
  // figure that actually spans "raise to today" for the set as a whole.
  const vsRaise = agg.raised > 0 ? ((mcapNow - agg.raised) / agg.raised) * 100 : null;

  return (
    <section className="card px-5 py-5 sm:px-6">
      <TrendSectionHeader
        eyebrow="Performance Analytics"
        color="var(--good)"
        title="Track every project from raise to today."
        subtitle="Combined market cap, treasury, holders and liquidity across every tracked project."
        action={<Link href="/screener" className="text-[11px] text-brand hover:underline">full screener →</Link>}
        divider
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TrendCard
          color="var(--good)" label="Value vs Raised"
          value={fmtUsd(mcapNow)}
          deltaPct={vsRaise} deltaLabel={`vs ${fmtUsd(agg.raised)} raised`}
          series={agg.mcap.series}
          title="Combined market cap of every tracked project against the total capital they raised. The sparkline is combined cap by day, priced off each project's daily close."
        />
        <TrendCard
          color="var(--accent)" label="Combined Treasury"
          value={fmtUsd(agg.treasury.now)}
          deltaPct={agg.treasury.changePct} deltaLabel={changeNote(agg.treasury)}
          series={agg.treasury.series}
        />
        <TrendCard
          color="#9b7ae0" label="Total Holders"
          value={fmtNum(agg.holders.now)}
          deltaPct={agg.holders.changePct} deltaLabel={changeNote(agg.holders)}
          series={agg.holders.series}
        />
        <TrendCard
          color="var(--warn)" label="Combined Liquidity"
          value={fmtUsd(liquidityNow)}
          deltaPct={agg.liquidity.changePct} deltaLabel={changeNote(agg.liquidity)}
          series={agg.liquidity.series}
        />
        <TrendCard
          color="#e08a3c" label="24h Volume"
          value={fmtUsd(vol24h)}
          deltaPct={agg.volume.changePct} deltaLabel={changeNote(agg.volume)}
          series={agg.volume.series}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------- treasury

export function TreasurySection({
  agg, liquidityNow,
}: {
  agg: HomeAggregates;
  liquidityNow: number;
}) {
  if (agg.treasury.now == null) return null;
  // How much of what was raised is still on-chain. The mock-up asked for a 7d
  // yield and a 7d expense figure here; neither exists — nothing records
  // treasury inflows, outflows or strategy positions, only a balance — so
  // these are the two real questions the balance can answer instead.
  const retained = agg.raised > 0 ? (agg.treasury.now / agg.raised) * 100 : null;

  return (
    <section className="card px-5 py-5 sm:px-6">
      <TrendSectionHeader
        eyebrow="Treasury Overview"
        color="var(--accent)"
        title="Treasury at a Glance."
        subtitle="Combined on-chain treasury across every tracked project, read at the last ingest."
        action={<Link href="/screener" className="text-[11px] text-brand hover:underline">view full treasury →</Link>}
        divider
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TrendCard
          color="var(--good)" label="Total Value"
          value={fmtUsd(agg.treasury.now)}
          deltaPct={agg.treasury.changePct} deltaLabel={changeNote(agg.treasury)}
          series={agg.treasury.series}
        />
        <TrendCard
          color="var(--accent)" label="Available Liquidity"
          value={fmtUsd(liquidityNow)}
          deltaPct={agg.liquidity.changePct} deltaLabel={changeNote(agg.liquidity)}
          series={agg.liquidity.series}
        />
        <TrendCard
          color="#9b7ae0" label="Capital Retained"
          value={retained != null ? `${retained.toFixed(0)}%` : "—"}
          deltaPct={agg.retained.changePct} deltaLabel={`of ${fmtUsd(agg.raised)} raised`}
          series={agg.retained.series}
          title="Combined treasury balance as a share of all capital raised. Not a yield or a burn rate — nothing on file records treasury inflows or outflows, only the balance at each read."
        />
        <TrendCard
          color="var(--warn)" label="Funded Projects"
          value={fmtNum(agg.treasuryProjects)}
          deltaLabel="with a balance on file"
          series={agg.fundedProjects.series}
        />
      </div>
      <p className="mt-3.5 text-center text-[11px] text-faint">
        Balances are read on-chain at each ingest. Figures move when a project reports, not continuously.
      </p>
    </section>
  );
}

// ------------------------------------------------------- development

export function DevelopmentSection({ agg }: { agg: HomeAggregates }) {
  const { dev, devSeries } = agg;
  if (!dev.projects) return null;

  return (
    // One container, not a card of cards: the commit list is the detail behind
    // the four figures above it, so it sits under the same border rather than
    // reading as an unrelated section that happens to follow.
    <section className="card overflow-hidden">
      <div className="px-5 py-5 sm:px-6">
        <TrendSectionHeader
          eyebrow="Development"
          color="var(--accent)"
          title="Development at a Glance."
          subtitle={`Combined GitHub activity across the ${dev.projects} projects with a linked organisation.`}
          action={<Link href="/screener" className="text-[11px] text-brand hover:underline">browse projects →</Link>}
        divider
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Labelled 90d because that is the window GitHub's search API is
              queried over — there is no 30-day commit count to show. */}
          <TrendCard
            color="var(--good)" label="Commits (90d)"
            value={fmtNum(dev.commits90d)}
            deltaPct={devSeries.commits90d.changePct}
            deltaLabel={changeNote(devSeries.commits90d)}
            series={devSeries.commits90d.series}
          />
          <TrendCard
            color="var(--accent)" label="Pull Requests"
            value={fmtNum(dev.mergedPrs)}
            deltaPct={devSeries.mergedPrs.changePct}
            deltaLabel="merged, all time"
            series={devSeries.mergedPrs.series}
          />
          <TrendCard
            color="#9b7ae0" label="Contributors"
            value={fmtNum(dev.contributors)}
            deltaPct={devSeries.contributors.changePct}
            deltaLabel="unique authors"
            series={devSeries.contributors.series}
          />
          <TrendCard
            color="#e08a3c" label="Repositories"
            value={fmtNum(dev.repos)}
            deltaPct={devSeries.repos.changePct}
            deltaLabel="owned, across all orgs"
            series={devSeries.repos.series}
          />
        </div>
      </div>

      {agg.commits.length > 0 && (
        <>
          <div className="flex items-baseline justify-between gap-3 border-t border-grid px-5 py-3.5 sm:px-6">
            <div>
              <h3 className="text-[14px] font-semibold">Recent Commits</h3>
              <p className="mt-0.5 text-[12px] text-ink2">
                The latest work landing across every tracked project.
              </p>
            </div>
            <Link href="/timeline" className="shrink-0 text-[11px] text-brand hover:underline">
              all activity →
            </Link>
          </div>
          <div className="divide-y divide-grid border-t border-grid">
            {agg.commits.map((c) => {
              // Same short sha the project pages derive — the last path segment
              // of the commit URL. The mock-up showed a branch chip beside it;
              // the ingest records no branch, so the project it landed in takes
              // that slot instead.
              const sha = c.url?.split("/").pop()?.slice(0, 7);
              return (
                <div key={c.url ?? `${c.slug}-${c.ts}`} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <Logo src={c.image_url} name={c.name} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{c.message}</div>
                    {c.author && <div className="mt-0.5 text-[11px] text-muted">{c.author}</div>}
                  </div>
                  <Link
                    href={`/project/${c.slug}#development`}
                    className="hidden shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[10.5px] text-ink2 hover:text-brand sm:block"
                  >
                    {c.name}
                  </Link>
                  {sha && (
                    <a
                      href={c.url ?? undefined} target="_blank" rel="noopener noreferrer"
                      className="num hidden shrink-0 text-[11px] text-ink2 hover:text-brand sm:block"
                    >
                      {sha}
                    </a>
                  )}
                  <span className="w-16 shrink-0 text-right text-[11px] text-muted">{timeAgo(c.ts)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
