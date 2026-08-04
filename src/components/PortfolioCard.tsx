"use client";

import { useState } from "react";
import { useWallet } from "./wallet";
import { fmtUsd } from "@/lib/format";

/**
 * Portfolio card, per the design's "Total Value" panel. Shows the connected
 * wallet's real USDC + SOL — never a fabricated balance. Position tracking
 * across MetaDAO tokens arrives with the trading release.
 */
export function PortfolioCard() {
  const w = useWallet();
  const [hidden, setHidden] = useState(false);

  const total =
    w.usdcBalance != null || w.solBalance != null
      ? (w.usdcBalance ?? 0) // SOL priced separately later; USDC is 1:1
      : null;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
        Portfolio value
        <button
          onClick={() => setHidden((h) => !h)}
          className="opacity-50 transition-opacity hover:opacity-100"
          aria-label={hidden ? "Show value" : "Hide value"}
        >
          {hidden ? "◌" : "◉"}
        </button>
      </div>

      <div className="num mt-1.5 text-[28px] font-extrabold tracking-tight">
        {w.address
          ? hidden ? "••••••" : total != null ? fmtUsd(total) : "…"
          : <span className="text-faint">—</span>}
      </div>
      <div className="mt-1 text-[12px] text-muted">
        {w.address ? "USDC in wallet" : "No wallet connected"}
      </div>

      <div className="mt-4 flex justify-between border-t border-grid pt-4">
        {([
          ["USDC", w.address && w.usdcBalance != null ? fmtUsd(w.usdcBalance) : "—"],
          ["SOL", w.address && w.solBalance != null ? w.solBalance.toFixed(3) : "—"],
          ["Positions", w.address ? "soon" : "—"],
        ] as const).map(([k, v]) => (
          <div key={k}>
            <div className="text-[10.5px] uppercase tracking-[0.07em] text-faint">{k}</div>
            <div className="num mt-0.5 text-[13.5px] font-bold">{hidden && w.address ? "•••" : v}</div>
          </div>
        ))}
      </div>

      {!w.address && (
        <button
          onClick={() => void w.connect()}
          disabled={w.connecting}
          className="mt-4 w-full rounded-xl bg-accent py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-accenthi disabled:opacity-60"
        >
          {w.connecting ? "Connecting…" : w.available ? "Connect wallet" : "Get Phantom"}
        </button>
      )}
    </div>
  );
}
