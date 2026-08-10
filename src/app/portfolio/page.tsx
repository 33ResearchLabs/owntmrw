import { requireSession } from "@/lib/session";
import {
  allObservations,
  globalTimeline,
  raisePriceOf,
  recentCloses,
  screenerRows,
} from "@/lib/queries";
import { liveSolPrice } from "@/lib/live";
import {
  Portfolio,
  type PortfolioFeedItem,
  type PortfolioSignal,
  type PortfolioToken,
} from "@/components/Portfolio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio — Underly",
  description: "What your wallet holds across every project tracked on Underly.",
};

/** Days of daily closes shipped per token — the longest range the chart offers. */
const CLOSE_DAYS = 90;

/**
 * The token universe and its live quotes are resolved here, where the price
 * cache already lives: prices are shared by every visitor and worth caching
 * centrally, while balances belong to one reader and are fetched per request
 * and kept by nobody — see `api/wallet/balances`, which the client calls once
 * the wallet is known.
 *
 * The feeds ship whole rather than filtered, for the same reason: which of
 * them are relevant depends on what the wallet holds, and the wallet is only
 * known in the browser. Filtering here would mean sending the holdings up.
 * Both tables are small enough that shipping all of them costs less than the
 * round trip that keeping them private would otherwise require.
 */
export default async function PortfolioPage() {
  // The real gate. `proxy.ts` only saw that a cookie existed; this is where
  // a forged or expired one is turned away.
  await requireSession("/portfolio");

  const [rows, solPrice] = await Promise.all([screenerRows(), liveSolPrice()]);
  const closes = recentCloses(CLOSE_DAYS);

  const tokens: PortfolioToken[] = rows
    .filter((r): r is typeof r & { mint: string } => !!r.mint)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      symbol: r.symbol,
      mint: r.mint,
      image_url: r.image_url,
      price_usd: r.price_usd,
      change_24h: r.change_24h,
      liquidity_usd: r.liquidity_usd,
      raise_price: raisePriceOf(r)?.usd ?? null,
      roi_since_raise: r.roi_since_raise,
      ath: r.ath,
      from_ath: r.from_ath,
      // The pool behind this row cannot defend its own price, so every return
      // derived from it is arithmetic rather than a measurement. Carried
      // through so the table can say so instead of printing the number.
      returns_thin: r.returns_thin,
      closes: closes.get(r.slug) ?? [],
    }));

  /*
   * One news story can name two projects, and the archive stores a row per
   * project — so a reader holding both saw the same headline twice, once under
   * each name. Collapsed on the title, carrying the projects it names.
   *
   * Only `news` is collapsed. The lifecycle types share a title by nature
   * rather than by subject: "Token trading began" is one label reused across
   * all 22 projects, so keying on it merged the entire archive into a single
   * row listing every project — including ones the reader does not hold, since
   * the row then matched the holdings filter through somebody else's slug.
   * Those are per-project events and stay one row each; a shared headline is
   * the only case where two rows are genuinely the same thing.
   */
  const byStory = new Map<string, PortfolioFeedItem>();
  for (const e of globalTimeline(160)) {
    const key = e.type === "news" ? `news|${e.title}` : `${e.type}|${e.slug}|${e.ts}`;
    const seen = byStory.get(key);
    if (seen) {
      if (!seen.slugs.includes(e.slug)) {
        seen.slugs.push(e.slug);
        seen.names.push(e.name);
      }
      continue;
    }
    byStory.set(key, {
      ts: e.ts, type: e.type, title: e.title, slugs: [e.slug], names: [e.name],
    });
  }

  const signals: PortfolioSignal[] = allObservations(120)
    .filter((o): o is typeof o & { slug: string; name: string } => !!o.slug && !!o.name)
    .map((o) => ({ slug: o.slug, name: o.name, text: o.text }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Portfolio</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          What your wallet holds across the {tokens.length} projects tracked here.
        </p>
      </div>
      <Portfolio
        tokens={tokens}
        solPrice={solPrice}
        events={[...byStory.values()]}
        signals={signals}
      />
    </div>
  );
}
