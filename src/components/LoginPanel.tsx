"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "./wallet";
import { IconBadge, type IconName } from "./viz";

/**
 * The sign-in screen.
 *
 * Its job is not decoration: a page that asks for a wallet signature is
 * exactly the shape of a phishing page, so the design has to answer "what am
 * I approving" before the button is reachable. Hence the three steps stated up
 * front and the scope note under the button — both are content, not ornament.
 */

/** What signing opens, named rather than implied. */
const GATED: { icon: IconName; color: string; name: string; what: string }[] = [
  { icon: "bars", color: "var(--accent)", name: "Screener", what: "Every project ranked across 16 measures" },
  { icon: "clock", color: "var(--good)", name: "Activity", what: "Launches, raises and releases as they land" },
  { icon: "target", color: "#9b7ae0", name: "Signals", what: "Movements picked out of on-chain data" },
  { icon: "pie", color: "#e08a3c", name: "Portfolio", what: "Your holdings against what each project raised" },
];

const STEPS = ["Connect Phantom", "Sign a message", "You're in"];

export function LoginPanel({ next }: { next: string }) {
  const { login, signingIn, available } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = async () => {
    setError(null);
    const err = await login();
    if (err) return setError(err);
    // The session is a fresh httpOnly cookie the router has not seen, so the
    // cache has to be dropped or the gated page renders from its signed-out
    // copy and bounces straight back here.
    router.refresh();
    router.replace(next);
  };

  return (
    <div className="w-full">
      {/* Masthead sits outside the card so the card reads as the form rather
          than as the whole page. */}
      <div className="mb-6 text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-[20px] font-black text-white"
          style={{
            background: "linear-gradient(180deg, var(--accent-hi), var(--accent))",
            boxShadow: "0 10px 26px -10px rgba(57,135,229,0.85)",
          }}
          aria-hidden
        >
          ∞
        </span>
        <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
          Sign in with your wallet
        </h1>
        <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-ink2">
          No password, no email. Your wallet signature is the login.
        </p>
      </div>

      <div className="hero px-6 py-6">
        {/* The glow is anchored bottom-right by `.hero`, which puts it behind
            the benefit list rather than behind the button. */}
        <div className="relative">
          {/* Wraps rather than stretches: three nowrap labels on one row are
              wider than a 390px viewport, and a step list that pushes the page
              sideways is worse than one that takes two lines. */}
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
            <p
              role="alert"
              className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] text-bad"
            >
              {error}
            </p>
          )}

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
        </div>
      </div>

      <div className="mt-5 text-center">
        <Link href="/" className="text-[12.5px] text-muted transition-colors hover:text-ink">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
