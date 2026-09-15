"use client";

import { useWallet } from "./wallet";

/**
 * The tap gate's prompt, and the place a wallet-app round-trip reports
 * back — phone and tablet only; neither state ever occurs on an extension.
 *
 * Two things can be showing here:
 *
 * 1. `continueNeeded` — a request to the wallet app is paused because no
 *    tap is live (the sign-in signature after connect, most often). Safari
 *    and Chrome only open another app inside a few seconds of a real tap,
 *    so the request waits for one. Tapping this — or the header button,
 *    which shows the same words — releases it.
 *
 * 2. `notice` — the app declined, never opened, or the sign-in failed after
 *    coming back. The reader has just landed on a reloaded page with no
 *    dialog open, so without this the failure would be silent.
 *
 * The chip label changes too (see `ConnectButton`): in the first field test
 * of the reference design the toast alone got missed while the chip still
 * read "Connecting…".
 */

const LABEL: Record<string, string> = {
  connect: "Tap to open your wallet",
  sign: "Tap to sign in",
  transaction: "Tap to approve in your wallet",
};

export function ContinueToast() {
  const w = useWallet();

  if (w.continueNeeded) {
    return (
      <button
        type="button"
        onClick={w.continueNeeded.resume}
        className="fixed inset-x-4 bottom-5 z-[90] mx-auto flex w-[min(92vw,420px)] items-center gap-3 rounded-2xl border border-brand/40 bg-surface px-4 py-3.5 text-left shadow-2xl transition-[filter] active:brightness-95"
      >
        <span className="pulse h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-ink">
            {LABEL[w.continueNeeded.what] ?? "Tap to continue"}
          </span>
          <span className="block text-[11.5px] text-muted">
            Your wallet app needs a tap from you to open.
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-brandink">
          Continue
        </span>
      </button>
    );
  }

  if (w.notice) {
    return (
      <div
        role="alert"
        className="fixed inset-x-4 bottom-5 z-[90] mx-auto flex w-[min(92vw,420px)] items-start gap-3 rounded-2xl border border-bad/40 bg-surface px-4 py-3.5 shadow-2xl"
      >
        <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink">
          {w.notice}
        </span>
        <button
          type="button"
          onClick={w.dismissNotice}
          aria-label="Dismiss"
          className="shrink-0 rounded-md px-1.5 text-[15px] leading-none text-muted hover:text-ink"
        >
          ×
        </button>
      </div>
    );
  }

  return null;
}
