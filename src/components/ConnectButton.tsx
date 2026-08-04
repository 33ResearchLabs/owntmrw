"use client";

import { useState } from "react";
import { useWallet } from "./wallet";
import { fmtUsd, shortAddr } from "@/lib/format";

export function ConnectButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);

  if (!w.address) {
    return (
      <button
        onClick={() => void w.connect()}
        disabled={w.connecting}
        className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-accenthi disabled:opacity-60"
      >
        {w.connecting ? "Connecting…" : w.available ? "Connect wallet" : "Get Phantom"}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-[10px] border border-line bg-white/5 px-3 py-2 text-[12.5px] font-semibold transition-colors hover:bg-white/10"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        <span className="num">{shortAddr(w.address)}</span>
        {w.usdcBalance != null && (
          <span className="num text-muted">{fmtUsd(w.usdcBalance)}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <div className="border-b border-grid px-4 py-3">
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-faint">Connected</div>
            <div className="num mt-0.5 break-all text-[12px] text-ink2">{w.address}</div>
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
            onClick={() => { setOpen(false); void w.disconnect(); }}
            className="w-full border-t border-grid px-4 py-2.5 text-left text-[12.5px] text-bad transition-colors hover:bg-white/5"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
