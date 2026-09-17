"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";

/**
 * The reader's watchlist, shared by every star on the page.
 *
 * Seeded by the root layout from the database on each render — the same
 * server read that decides what the nav shows — so the first paint already
 * knows which stars are lit. From then on this holds the truth in the
 * browser: a click flips the star at once and the request follows; the reply
 * carries the whole list, which replaces the guess, and a failure puts the
 * star back. Sign-in and sign-out both `router.refresh()` the layout, which
 * arrives here as a new seed and resets the set.
 *
 * Signed out, every star is dark and a click opens the sign-in dialog
 * rather than sending a request that would only come back 401.
 */
interface Watchlist {
  slugs: ReadonlySet<string>;
  has: (slug: string) => boolean;
  /** Flip one project. Resolves once the server has answered, either way. */
  toggle: (slug: string) => Promise<void>;
  /** Projects with a request in flight — the star holds its new state meanwhile. */
  pending: ReadonlySet<string>;
  /** True when a session exists, so surfaces can decide whether to render at all. */
  signedIn: boolean;
}

const Ctx = createContext<Watchlist | null>(null);

export function WatchlistProvider({
  initialSlugs,
  children,
}: {
  initialSlugs: string[];
  children: React.ReactNode;
}) {
  const w = useWallet();
  const signIn = useSignIn();

  const seedKey = initialSlugs.join("\n");
  const [slugs, setSlugs] = useState<Set<string>>(() => new Set(initialSlugs));
  // A new seed (sign-in, sign-out, a refresh) replaces the set during render
  // rather than in an effect, so the stars never paint the old list first.
  const [seenSeed, setSeenSeed] = useState(seedKey);
  if (seedKey !== seenSeed) {
    setSeenSeed(seedKey);
    setSlugs(new Set(initialSlugs));
  }
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const signedIn = w.session != null;

  const toggle = useCallback(
    async (slug: string) => {
      if (!signedIn) {
        signIn.open();
        return;
      }
      const wasIn = slugs.has(slug);
      setSlugs((s) => {
        const n = new Set(s);
        if (wasIn) n.delete(slug); else n.add(slug);
        return n;
      });
      setPending((s) => new Set(s).add(slug));
      try {
        const res = await fetch("/api/watchlist", {
          method: wasIn ? "DELETE" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { slugs: string[] };
        setSlugs(new Set(data.slugs));
      } catch {
        // Put the star back where the server still has it.
        setSlugs((s) => {
          const n = new Set(s);
          if (wasIn) n.add(slug); else n.delete(slug);
          return n;
        });
      } finally {
        setPending((s) => {
          const n = new Set(s);
          n.delete(slug);
          return n;
        });
      }
    },
    [signedIn, signIn, slugs],
  );

  const value = useMemo<Watchlist>(
    () => ({
      slugs,
      has: (slug) => signedIn && slugs.has(slug),
      toggle,
      pending,
      signedIn,
    }),
    [slugs, toggle, pending, signedIn],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWatchlist(): Watchlist {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return ctx;
}
