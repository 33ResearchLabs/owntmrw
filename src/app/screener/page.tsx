import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { screenerRows } from "@/lib/queries";
import { screenerExtras } from "@/lib/health";
import { ScreenerTable } from "@/components/ScreenerTable";
import { fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Screener — tekno.works",
  description: "Every MetaDAO and Futard project ranked by market cap, ROI since raise, liquidity, treasury, holders and development activity.",
};

export default async function ScreenerPage() {
  // The real gate. `proxy.ts` only saw that a cookie existed; this is where
  // a forged or expired one is turned away.
  await requireSession("/screener");

  const rows = await screenerRows();
  const totalRaised = rows.reduce((s, r) => s + (r.raise_amount_usd ?? 0), 0);
  // One clock for the whole table, so every row's returns are measured from
  // the same "now". This page is force-dynamic and renders once per request.
  // eslint-disable-next-line react-hooks/purity
  const nowSec = Math.floor(Date.now() / 1000);
  const extras = screenerExtras(rows, nowSec);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">Screener</h1>
          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted">
            Every project launched through MetaDAO and Futard. Click any column to sort, filter
            by name, category or size, and share the address bar — it carries the view. Market
            caps use MetaDAO&apos;s circulating supply, not FDV.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-12 text-center text-[13px] text-muted">
          No data yet. Run{" "}
          <code className="rounded bg-surface2 px-1.5 py-0.5 text-ink2">npm run ingest</code>{" "}
          to pull everything from public sources.
        </div>
      ) : (
        // The table reads its view from the URL, which `useSearchParams` serves
        // synchronously on this force-dynamic page; the boundary is insurance
        // for the day the route is made static, per the Next docs.
        <Suspense fallback={null}>
          <ScreenerTable
            rows={rows.map((r) => {
              const x = extras.get(r.slug);
              return {
                slug: r.slug, name: r.name, symbol: r.symbol, status: r.status,
                image_url: r.image_url, category: r.category,
                price_usd: r.price_usd, mcap: r.mcap, fdv: r.fdv,
                liquidity_usd: r.liquidity_usd, vol24h: r.vol24h, change_24h: r.change_24h,
                raise_amount_usd: r.raise_amount_usd, raise_price: r.raise_price,
                raise_price_derived: r.raise_price_derived,
                roi_since_raise: r.roi_since_raise, returns_thin: r.returns_thin,
                raise_absence: r.raise_absence,
                ath_return: r.ath_return, from_ath: r.from_ath, treasury_usd: r.treasury_usd,
                holder_count: r.holder_count,
                gh_stars: r.gh_stars, gh_last_push: r.gh_last_push,
                health: x?.health.overall ?? null,
                health_measured: x?.health.measured ?? 0,
                ret_7d: x?.d7 ?? null,
                ret_30d: x?.d30 ?? null,
              };
            })}
          />
        </Suspense>
      )}

      <p className="text-[11.5px] text-faint">
        Raised totals {fmtUsd(totalRaised)} across all indexed raises. Prices, caps, depth and
        volume are quoted live; holders, treasury, governance and development are indexed from
        public sources at the last ingest.
      </p>
    </div>
  );
}
