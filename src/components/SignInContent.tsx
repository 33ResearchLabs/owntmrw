"use client";

import { useState } from "react";
import { useWallet, WALLETS } from "./wallet";

/**
 * The sign-in body, shared by the `/login` page and the header modal.
 *
 * One component rather than two copies: the wording here is the security
 * explanation — what signing does and what it cannot do — and two copies of
 * that would eventually disagree, which is exactly the kind of drift that
 * teaches people to stop reading it.
 *
 * Its job is not decoration. A page asking for a wallet signature is exactly
 * the shape of a phishing page, so the steps and the scope note under the
 * button are content, not ornament.
 */

/**
 * The modal panel is 392px wide, where the full labels wrap to a second line.
 * Shorter ones there keep the sequence on one row; the page has the room for
 * the fuller wording.
 */
const STEPS = ["Connect a wallet", "Sign a message", "You're in"];
const STEPS_COMPACT = ["Connect", "Sign", "You're in"];

/**
 * A recognisable mark for each entry in `WALLETS`, drawn rather than pulled
 * from an asset — a wallet-selector row that reads "Phantom" beside a generic
 * glyph does not read as Phantom. Each is an original line-art silhouette in
 * that wallet's own colour family, not a reproduction of the trademarked logo
 * — close enough to place at a glance, not a copy of the asset itself.
 */
const WALLET_MARK: Record<string, { color: string; glyph: React.ReactNode }> = {
  phantom: {
    color: "#7a63e8",
    glyph: (
      <>
        <path d="M6 20v-7a6 6 0 0 1 12 0v7" />
        <path d="M6 20a2 2 0 0 0 2-2M10 20a2 2 0 0 0 2-2M14 20a2 2 0 0 0 2-2M18 20a2 2 0 0 0 2-2" />
        <circle cx="10" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="14" cy="12" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  solflare: {
    color: "#e08a3c",
    glyph: (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M18.9 5.1l-2.1 2.1M7.2 16.8l-2.1 2.1" />
      </>
    ),
  },
  backpack: {
    color: "#a98a55",
    glyph: (
      <>
        <path d="M7 9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9Z" />
        <path d="M9 7V6a3 3 0 0 1 6 0v1" />
        <path d="M9 13h6M10 20v-4h4v4" />
      </>
    ),
  },
};

function WalletMark({ id, size = 34 }: { id: string; size?: number }) {
  const mark = WALLET_MARK[id];
  if (!mark) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, color: mark.color, background: `color-mix(in srgb, ${mark.color} 14%, transparent)` }}
    >
      <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {mark.glyph}
      </svg>
    </span>
  );
}

/**
 * What the card shows between a verified signature and the destination
 * arriving.
 *
 * The gap is real and can be seconds: `login` sets `session` the moment
 * `/api/auth/verify` returns, so the header switches to its connected chip
 * immediately, while the destination is still being rendered server-side.
 * Without this the body underneath that chip still read "1 Connect a wallet"
 * over three untouched wallet rows — the card claiming signed-out while the
 * header claimed signed-in, which reads as a page that has hung.
 *
 * The dot is `.pulse` in `--good`, the same one the header's connected chip
 * and the Live Activity heading use, so the two agree at a glance instead of
 * contradicting each other.
 */
function Redirecting() {
  return (
    <div role="status" className="flex flex-col items-center gap-2 py-7 text-center">
      <span className="pulse h-2 w-2 rounded-full bg-good" aria-hidden />
      <span className="text-[13px] font-semibold text-ink">Signed in</span>
      <span className="text-[11.5px] text-muted">Taking you where you were headed…</span>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-faint" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * One row per wallet in `WALLETS`. A detected one connects on click; one
 * that isn't opens its install page in a new tab instead — the reader never
 * lands on a row that does nothing.
 */
function WalletList({ onPick, busyId }: { onPick: (id: string) => void; busyId: string | null }) {
  const { installedWallets } = useWallet();

  return (
    <div className="flex flex-col gap-2">
      {WALLETS.map((w) => {
        const installed = installedWallets.includes(w.id);
        const busy = busyId === w.id;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() =>
              installed
                ? onPick(w.id)
                : window.open(w.installUrl, "_blank", "noopener")
            }
            disabled={busyId != null && !busy}
            className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface2/40 px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-line2 hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <WalletMark id={w.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">{w.name}</span>
              <span className="block text-[10.5px] text-muted">
                {busy ? "Check your wallet…" : installed ? "Detected" : "Not installed"}
              </span>
            </span>
            {installed ? <Chevron /> : (
              <span className="shrink-0 rounded-md border border-line2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink2">
                Get
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SignInContent({
  onDone,
  compact = false,
}: {
  /**
   * Called after a session exists. The page navigates to `next`; the modal
   * just closes, which is the whole reason it exists.
   */
  onDone: () => void;
  /** Drops the benefit list — the modal opens over the thing being unlocked. */
  compact?: boolean;
}) {
  const { login } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onPick = async (id: string) => {
    setError(null);
    setBusyId(id);
    const err = await login(id);
    if (err) {
      // Only the failure path comes back to the picker, so this is the only
      // path that clears the busy row. It used to sit in a `finally`, which
      // ran the instant the router call was *issued* rather than when the
      // navigation landed — so the row dropped "Check your wallet…" and the
      // card went fully idle while the destination was still loading.
      setError(err);
      setBusyId(null);
      return;
    }
    // No `router.refresh()` here any more. It refetched whichever route the
    // card happens to sit on, which on `/login` is a route whose server
    // component now redirects — a round-trip whose only outcome was a
    // redirect, racing the caller's own navigation. Cache invalidation is the
    // caller's business now: it is only load-bearing when nothing navigates,
    // which is the header modal's case alone. Every page here is
    // `force-dynamic`, so a real navigation always refetches with the new
    // cookie regardless.
    setDone(true);
    onDone();
  };

  if (done) return <Redirecting />;

  return (
    <>
      {/* Wraps rather than stretches: three nowrap labels on one row are wider
          than a 390px viewport, and a step list that pushes the page sideways
          is worse than one that takes two lines. */}
      <ol className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${compact ? "justify-center" : ""}`}>
        {(compact ? STEPS_COMPACT : STEPS).map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line2 text-[10px] font-bold text-ink2">
              {i + 1}
            </span>
            <span className="text-[11.5px] text-ink2">{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <WalletList onPick={(id) => void onPick(id)} busyId={busyId} />
      </div>

      {/* The scope note carries a lock because it is the one line on this
          screen a hurried reader most needs to have seen. */}
      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] leading-relaxed text-faint">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
          <rect x="4" y="10.5" width="16" height="10" rx="2" />
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
        </svg>
        Signature only — no transaction, no fund access.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] text-bad">
          {error}
        </p>
      )}
    </>
  );
}
