"use client";

import Link from "next/link";
import { Logo } from "./ui";
import { WatchButton } from "./WatchButton";
import { useWatchlist } from "./WatchlistProvider";
import { fmtPrice, fmtPct } from "@/lib/format";

/** The little a row needs: identity plus the two figures a glance wants. */
export interface WatchRow {
  slug: string;
  name: string;
  symbol: string | null;
  image_url: string | null;
  price_usd: number | null;
  change_24h: number | null;
}

/**
 * The reader's watchlist as a card of rows.
 *
 * Takes every project and keeps the watched ones, in the order they were
 * followed (the provider's seed is newest-first). Shipping all 28 rows costs
 * less than a round trip and keeps which projects are watched out of the
 * server render, which is shared markup — the same reason the portfolio
 * page ships its feeds whole.
 *
 * Renders nothing for a signed-out reader: there is no list to show and the
 * star on any project page is the invitation.
 */
export function WatchingCard({
  rows,
  title = "Watching",
  limit,
  className = "",
}: {
  rows: WatchRow[];
  title?: string;
  /** Cap the rows shown; the rest are a "View all" away on the screener. */
  limit?: number;
  className?: string;
}) {
  const wl = useWatchlist();
  if (!wl.signedIn) return null;

  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const watched = Array.from(wl.slugs)
    .map((s) => bySlug.get(s))
    .filter((r): r is WatchRow => !!r);
  const shown = limit ? watched.slice(0, limit) : watched;

  return (
    <div className={`card px-5 pb-2.5 pt-4 ${className}`}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[14.5px] font-bold">{title}</span>
        {watched.length > 0 && (
          <span className="num text-[11px] text-faint">{watched.length}</span>
        )}
      </div>

      {watched.length === 0 ? (
        <p className="border-t border-grid py-3 text-[12.5px] leading-relaxed text-muted">
          Star a project on its page or in the screener and it appears here, and
          the Signals and Activity feeds gain a &ldquo;My watchlist&rdquo; filter.
        </p>
      ) : (
        shown.map((r) => (
          <Link
            key={r.slug}
            href={`/project/${r.slug}`}
            className="flex items-center gap-3 border-t border-grid py-2.5"
          >
            <Logo src={r.image_url} name={r.name} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{r.name}</span>
              <span className="num block text-[11px] text-faint">
                {fmtPrice(r.price_usd)}
                {r.symbol && <span className="ml-1.5 text-faint">{r.symbol}</span>}
              </span>
            </span>
            <span
              className={`num text-[12.5px] font-bold ${
                r.change_24h == null ? "text-muted" : (r.change_24h ?? 0) >= 0 ? "text-good" : "text-bad"
              }`}
            >
              {r.change_24h == null ? "—" : fmtPct(r.change_24h)}
            </span>
            <WatchButton slug={r.slug} size="sm" />
          </Link>
        ))
      )}

      {limit != null && watched.length > limit && (
        <Link
          href="/screener"
          className="block border-t border-grid py-2.5 text-[12px] text-brand hover:underline"
        >
          View all {watched.length} in the screener →
        </Link>
      )}
    </div>
  );
}
