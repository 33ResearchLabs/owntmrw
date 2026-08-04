import { screenerRows } from "@/lib/queries";
import { ScreenerTable } from "@/components/ScreenerTable";
import { fmtUsd, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Screener — OwnTmrw",
  description: "Every MetaDAO and Futard project ranked by market cap, ROI since raise, liquidity, treasury, holders and development activity.",
};

export default function ScreenerPage() {
  const rows = screenerRows();
  const totalMcap = rows.reduce((s, r) => s + (r.mcap ?? 0), 0);
  const totalVol = rows.reduce((s, r) => s + (r.vol24h ?? 0), 0);
  const totalLiq = rows.reduce((s, r) => s + (r.liquidity_usd ?? 0), 0);
  const totalRaised = rows.reduce((s, r) => s + (r.raise_amount_usd ?? 0), 0);

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="card px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="num mt-1 text-[18px] font-extrabold tracking-tight">{value}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Screener</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink2">
            Every project launched through MetaDAO and Futard. Click any column to sort, or any
            row to open its trading terminal. Market caps use MetaDAO&apos;s circulating supply,
            not FDV.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Projects" value={String(rows.length)} />
        <Stat label="Combined Mkt Cap" value={fmtUsd(totalMcap)} />
        <Stat label="Total Liquidity" value={fmtUsd(totalLiq)} />
        <Stat label="24h Volume" value={fmtUsd(totalVol)} />
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-12 text-center text-[13px] text-muted">
          No data yet. Run{" "}
          <code className="rounded bg-surface2 px-1.5 py-0.5 text-ink2">npm run ingest</code>{" "}
          to pull everything from public sources.
        </div>
      ) : (
        <ScreenerTable
          rows={rows.map((r) => ({
            slug: r.slug, name: r.name, symbol: r.symbol, status: r.status,
            image_url: r.image_url, category: r.category,
            price_usd: r.price_usd, mcap: r.mcap, fdv: r.fdv,
            liquidity_usd: r.liquidity_usd, vol24h: r.vol24h, change_24h: r.change_24h,
            raise_amount_usd: r.raise_amount_usd, roi_since_raise: r.roi_since_raise,
            ath_return: r.ath_return, from_ath: r.from_ath, treasury_usd: r.treasury_usd,
            holder_count: r.holder_count, holder_change_7d: r.holder_change_7d,
            gh_stars: r.gh_stars, gh_last_push: r.gh_last_push,
            proposal_count: r.proposal_count,
          }))}
        />
      )}

      <p className="text-[11.5px] text-faint">
        Raised totals {fmtUsd(totalRaised)} across all indexed raises. Figures are indexed from
        public sources and may lag live markets.
      </p>
    </div>
  );
}
