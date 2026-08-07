"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "./wallet";
import { WalletModal } from "./WalletModal";
import { fmtUsd, shortAddr } from "@/lib/format";

function WalletGlyph() {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" />
      <path d="M3 8.5h14.5" /><path d="M16.5 13.5h.01" />
    </svg>
  );
}

export function ConnectButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Opens the modal instead of firing the wallet call from here, so signing in
  // from the header does not throw the reader off whatever they were reading.
  // `SignInContent` owns the login call and the cache refresh.
  const [modal, setModal] = useState(false);

  const signOut = async () => {
    setOpen(false);
    await w.logout();
    await w.disconnect();
    router.refresh();
  };

  /*
   * Gated on the session, not on `address`.
   *
   * Phantom reconnects silently on mount for a site it already trusts, so
   * `address` goes true with nobody having signed in — the header was showing
   * a connected wallet, balances and all, for a visitor the server had never
   * authenticated. A connected wallet is not a signed-in one.
   */
  /*
   * A session names one wallet. If the user switches accounts in Phantom
   * afterwards, `address` moves and `session` does not — leaving the header
   * showing a signed-in address the wallet is no longer on. Treat that as
   * signed out, so the only way forward is to sign the new key in.
   */
  const stale = w.session != null && w.address != null && w.address !== w.session;

  if (!w.session || stale) {
    return (
      <div className="relative">
      <button
        onClick={() => setModal(true)}
        disabled={w.signingIn}
        className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-bold text-white transition-[filter,box-shadow] duration-150 hover:brightness-[1.08] active:brightness-95 disabled:opacity-60 sm:px-4"
        style={{
          background: "linear-gradient(180deg, var(--accent-hi) 0%, var(--accent) 100%)",
          boxShadow: "0 6px 18px -7px rgba(57, 135, 229, 0.9), inset 0 1px 0 0 rgba(255, 255, 255, 0.18)",
        }}
      >
        <WalletGlyph />
        {w.signingIn ? "Check your wallet…" : stale ? "Wallet changed — sign in" : w.available ? "Sign in" : "Get Phantom"}
      </button>
      <WalletModal open={modal} onClose={() => setModal(false)} />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-line2 bg-white/5 px-3 py-2.5 text-[12.5px] font-semibold transition-colors duration-150 hover:bg-white/10"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        <span className="num">{shortAddr(w.session)}</span>
        {w.usdcBalance != null && (
          <span className="num text-muted">{fmtUsd(w.usdcBalance)}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <div className="border-b border-grid px-4 py-3">
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-faint">Signed in</div>
            <div className="num mt-0.5 break-all text-[12px] text-ink2">{w.session}</div>
          </div>
          <div className="flex justify-between px-4 py-3 text-[12.5px]">
            <span className="text-muted">USDC</span>
            <span className="num font-semibold">{w.usdcBalance != null ? fmtUsd(w.usdcBalance) : "—"}</span>
          </div>
          <div className="flex justify-between border-t border-grid px-4 py-3 text-[12.5px]">
            <span className="text-muted">SOL</span>
            <span className="num font-semibold">{w.solBalance != null ? w.solBalance.toFixed(3) : "—"}</span>
          </div>
          <button
            onClick={() => void signOut()}
            className="w-full border-t border-grid px-4 py-2.5 text-left text-[12.5px] text-bad transition-colors hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
