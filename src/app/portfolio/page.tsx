import { screenerRows } from "@/lib/queries";
import { Portfolio, type PortfolioToken } from "@/components/Portfolio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio — OwnTmrw",
  description: "What your wallet holds across every project tracked on OwnTmrw.",
};

/**
 * The token universe and its live quotes are resolved here, on the server,
 * where the price cache already lives — the browser only reads the wallet's
 * own balances. That split is deliberate: prices are shared by every visitor
 * and worth caching centrally, while balances belong to one reader and have
 * no reason to reach the server at all.
 */
export default async function PortfolioPage() {
  const tokens: PortfolioToken[] = (await screenerRows())
    .filter((r): r is typeof r & { mint: string } => !!r.mint)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      symbol: r.symbol,
      mint: r.mint,
      image_url: r.image_url,
      price_usd: r.price_usd,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Portfolio</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          What your wallet holds across the {tokens.length} projects tracked here.
        </p>
      </div>
      <Portfolio tokens={tokens} />
    </div>
  );
}
