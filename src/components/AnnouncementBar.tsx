"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Thin promotional strip above the navigation.
 *
 * Deliberately a sibling of the sticky header rather than part of it: the
 * header pins to `top-0`, and folding this in would push the pinned pill down
 * by the strip's height on every page. Sitting above it, the strip scrolls away
 * and the navbar keeps the offset `--nav-h` already describes.
 *
 * Dismissal is component-local on purpose — it hides the strip for the current
 * view and touches nothing else.
 */
export function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative border-b border-line bg-surface2/50">
      {/* Padded clear of the close button on both sides so the centred text
          stays centred against the bar rather than against the space left over. */}
      <div className="mx-auto flex min-h-[38px] max-w-[1660px] items-center justify-center px-10 py-2 sm:px-12">
        <p className="flex min-w-0 items-center justify-center gap-1.5 text-center text-[12px] leading-snug">
          {/*
           * The badge is a flex item, not part of the sentence. Inline inside
           * the truncating span it was subject to that span's `overflow:
           * hidden`, and an inline box does not grow the line to fit its own
           * padding — so the border was sliced off along the top. Out here it
           * sets its own height, and it survives the ellipsis on a phone
           * instead of being the first thing truncated away.
           */}
          <span className="shrink-0 rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
            NEW
          </span>
          {/* Ellipsises on a phone, wraps rather than overflows once there is
              room for a second line, and sits on one line on a desktop. */}
          <span className="min-w-0 truncate text-ink md:whitespace-normal">
            Underly delivers institutional-grade intelligence. Analyze every
            project through holders, treasury, development and performance—all
            from a single workspace.
          </span>
          <Link
            href="/screener"
            className="ml-1 shrink-0 font-medium text-brand transition-colors hover:text-brandhi"
          >
            Learn more →
          </Link>
        </p>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss announcement"
        title="Dismiss"
        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md
                   text-[15px] leading-none text-faint transition-colors hover:bg-white/5 hover:text-ink2 sm:right-3"
      >
        ×
      </button>
    </div>
  );
}
