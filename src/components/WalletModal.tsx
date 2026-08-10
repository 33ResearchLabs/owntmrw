"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "./ui";
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
      <div className="w-[min(92vw,392px)] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        {/* Crest. The accent glow sits behind the mark rather than washing the
            whole panel, so the eye lands on the brand and then on the button
            below it — not on a gradient. */}
        <div className="relative px-6 pb-5 pt-7 text-center">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-32"
            style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(57,135,229,0.20), transparent 70%)" }}
            aria-hidden
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-[15px] leading-none text-muted transition-colors hover:bg-white/8 hover:text-ink"
          >
            ×
          </button>

          <Mark size={44} className="relative mx-auto" />
          <h2 id="wallet-modal-title" className="relative mt-3.5 text-[18px] font-extrabold tracking-tight">
            Sign in with your wallet
          </h2>
          <p className="relative mx-auto mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-ink2">
            No password, no email. Your wallet signature is the login.
          </p>
        </div>

        <div className="border-t border-grid px-6 pb-6 pt-5">
          <SignInContent
            compact
            onDone={() => {
              onClose();
              // Opened from a gated link: finish the journey it started.
              // Opened from the header: stay exactly where the reader was.
              //
              // The refresh belongs to the second case only, and moved here
              // from `SignInContent` so it fires just for it. The session is a
              // fresh httpOnly cookie the router has not seen, and staying put
              // means nothing else will ever go and ask — so the page behind
              // this dialog would keep rendering its signed-out output. When
              // `next` is set the navigation does that job already: every page
              // is `force-dynamic`, so it refetches with the new cookie, and
              // refreshing as well would just be a second request for it.
              if (next) router.push(next);
              else router.refresh();
            }}
          />
        </div>
      </div>
    </dialog>
  );
}
