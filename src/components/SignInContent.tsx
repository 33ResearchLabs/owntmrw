"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "./wallet";
import { IconBadge, type IconName } from "./viz";

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

/** What signing opens, named rather than implied. */
const GATED: { icon: IconName; color: string; name: string; what: string }[] = [
  { icon: "bars", color: "var(--accent)", name: "Screener", what: "Every project ranked across 16 measures" },
  { icon: "clock", color: "var(--good)", name: "Activity", what: "Launches, raises and releases as they land" },
  { icon: "target", color: "#9b7ae0", name: "Signals", what: "Movements picked out of on-chain data" },
  { icon: "pie", color: "#e08a3c", name: "Portfolio", what: "Your holdings against what each project raised" },
];

const STEPS = ["Connect Phantom", "Sign a message", "You're in"];

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
  const { login, signingIn, available } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = async () => {
    setError(null);
    const err = await login();
    if (err) return setError(err);
    // The session is a fresh httpOnly cookie the router has not seen, so the
    // cache has to be dropped or server components keep rendering their
    // signed-out output — including the gated page this was aimed at.
    router.refresh();
    onDone();
  };

  return (
    <>
      {/* Wraps rather than stretches: three nowrap labels on one row are wider
          than a 390px viewport, and a step list that pushes the page sideways
          is worse than one that takes two lines. */}
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line2 text-[10px] font-bold text-ink2">
              {i + 1}
            </span>
            <span className="text-[11.5px] text-ink2">{s}</span>
          </li>
        ))}
      </ol>

      <button
        onClick={() => void onClick()}
        disabled={signingIn}
        className="btn-primary mt-5 w-full disabled:opacity-60"
        style={{ boxShadow: "0 10px 26px -12px rgba(57,135,229,0.9)" }}
      >
        {signingIn ? "Check your wallet…" : available ? "Connect wallet" : "Install Phantom"}
      </button>

      <p className="mt-2.5 text-center text-[11px] leading-relaxed text-faint">
        Signature only. It approves no transaction and cannot move funds.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] text-bad">
          {error}
        </p>
      )}

      {!compact && (
        <div className="mt-6 border-t border-grid pt-5">
          <div className="text-[10.5px] uppercase tracking-[0.09em] text-faint">What this opens</div>
          <ul className="mt-3 space-y-3">
            {GATED.map((g) => (
              <li key={g.name} className="flex items-center gap-3">
                <IconBadge name={g.icon} color={g.color} size={28} />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-ink">{g.name}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{g.what}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
