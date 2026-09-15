"use client";

import Link from "next/link";
import { Mark } from "./ui";
import { SignInContent } from "./SignInContent";

/**
 * The full-page sign-in — the redirect target `proxy.ts` sends a signed-out
 * request to. The body is shared with the header modal; only the framing
 * differs, because a page arrived at by redirect has to explain itself from
 * scratch while a modal opens over the context it interrupted.
 */
export function LoginPanel({ next }: { next: string }) {
  return (
    <div className="w-full">
      {/* Masthead sits outside the card so the card reads as the form rather
          than as the whole page. */}
      <div className="mb-6 text-center">
        <Mark size={48} className="mx-auto" />
        <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
          Sign in with your wallet
        </h1>
        <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-ink2">
          No password, no email. Your wallet signature is the login.
        </p>
      </div>

      <div className="hero px-6 py-6">
        <div className="relative">
          {/* A full navigation, not `router.replace`. The reader got here by
              clicking a gated link, and the router prefetched that link
              while they were still signed out — so its cache holds the
              proxy's redirect *back to this page*. A soft navigation reuses
              that entry, lands on `/login` again, and this card keeps its
              "Signed in" state forever. A real request carries the fresh
              cookie past the proxy and lands where the click was aimed.
              `replace` keeps `/login` out of history so Back doesn't return
              to a page that would only redirect again. */}
          <SignInContent next={next} onDone={() => window.location.replace(next)} />
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
