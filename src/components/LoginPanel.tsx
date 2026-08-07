"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { SignInContent } from "./SignInContent";

/**
 * The full-page sign-in — the redirect target `proxy.ts` sends a signed-out
 * request to. The body is shared with the header modal; only the framing
 * differs, because a page arrived at by redirect has to explain itself from
 * scratch while a modal opens over the context it interrupted.
 */
export function LoginPanel({ next }: { next: string }) {
  const router = useRouter();

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
        <div className="relative">
          <SignInContent onDone={() => router.replace(next)} />
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
