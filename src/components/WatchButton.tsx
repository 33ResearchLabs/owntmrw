"use client";

import { useWatchlist } from "./WatchlistProvider";

/**
 * The star. Lit when the project is on the reader's watchlist, dark
 * otherwise, and a plain outline for a signed-out reader — for whom a click
 * opens sign-in rather than doing nothing.
 *
 * It stops the click where it lands: the star often sits inside a row that
 * is itself a link, and following the link on the way to a bookmark is the
 * one thing this must never do.
 */
export function WatchButton({
  slug,
  size = "md",
  className = "",
}: {
  slug: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const wl = useWatchlist();
  const on = wl.has(slug);
  const busy = wl.pending.has(slug);
  const px = size === "sm" ? 14 : 18;
  const box = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const label = !wl.signedIn
    ? "Sign in to add to your watchlist"
    : on
      ? "Remove from watchlist"
      : "Add to watchlist";

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void wl.toggle(slug);
      }}
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-md transition-colors
                  ${on ? "text-brand hover:text-brandhi" : "text-faint hover:bg-white/6 hover:text-ink2"}
                  disabled:opacity-60 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        aria-hidden
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      >
        <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
      </svg>
    </button>
  );
}
