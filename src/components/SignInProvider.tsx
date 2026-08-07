"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { WalletModal } from "./WalletModal";

/**
 * One sign-in dialog for the whole app.
 *
 * Both the header button and the gated nav links need to open it, and two
 * copies mounted in two places would be two dialogs — so the state lives here
 * and the modal is rendered once, at the root.
 *
 * This is convenience, not the gate. `proxy.ts` runs before any React does and
 * has no modal to open, so a hard navigation to a gated URL still redirects to
 * `/login`, and the pages themselves still call `requireSession`. Intercepting
 * a click is a nicety for people already on the site; it protects nothing.
 */
interface SignIn {
  /** Open the dialog. `next` is where to go once a session exists. */
  open: (next?: string) => void;
  /** Routes that require a session — the click interception list. */
  gated: (href: string) => boolean;
}

const Ctx = createContext<SignIn | null>(null);

/** Kept in step with the matcher in `proxy.ts`. */
const GATED = ["/screener", "/timeline", "/observations", "/portfolio"];

export function SignInProvider({ children }: { children: React.ReactNode }) {
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const value = useMemo<SignIn>(
    () => ({
      open: (n?: string) => { setNext(n ?? null); setOpen(true); },
      gated: (href: string) => GATED.some((p) => href === p || href.startsWith(`${p}/`)),
    }),
    []
  );

  const close = useCallback(() => { setOpen(false); setNext(null); }, []);

  return (
    <Ctx.Provider value={value}>
      {children}
      <WalletModal open={open} next={next} onClose={close} />
    </Ctx.Provider>
  );
}

export function useSignIn(): SignIn {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSignIn must be used inside SignInProvider");
  return ctx;
}
