"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SignInContent } from "./SignInContent";

/**
 * Sign-in without leaving the page.
 *
 * Built on the native `<dialog>` rather than a div with a high z-index,
 * because `showModal()` supplies the focus trap, the Escape handler, the
 * inert background and the `::backdrop` for free — all things a hand-rolled
 * overlay gets wrong quietly, and all things a login dialog in particular has
 * no business getting wrong.
 *
 * This is a convenience, not the gate. `/login` remains the redirect target
 * for `proxy.ts`, which runs before any React does and has no modal to open;
 * and the pages themselves still call `requireSession`. Nothing here is
 * load-bearing for security — closing it grants nothing.
 */
export function WalletModal({
  open, onClose, next = null,
}: {
  open: boolean;
  onClose: () => void;
  /** Where the click was aimed before it was intercepted, if anywhere. */
  next?: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // The page behind a modal must not scroll under it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="wallet-modal-title"
      onClose={onClose}
      // A click landing on the dialog itself is a click on the backdrop — the
      // panel below stops its own clicks from reaching here.
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="wallet-modal"
    >
      <div className="w-[min(92vw,400px)] rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="wallet-modal-title" className="text-[17px] font-extrabold tracking-tight">
              Sign in with your wallet
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink2">
              No password, no email. Your wallet signature is the login.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-[16px] leading-none text-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="mt-5">
          <SignInContent
            compact
            onDone={() => {
              onClose();
              // Opened from a gated link: finish the journey it started.
              // Opened from the header: stay exactly where the reader was.
              if (next) router.push(next);
            }}
          />
        </div>
      </div>
    </dialog>
  );
}
