"use client";

import { useEffect, useState } from "react";
import { InvestModal } from "./InvestModal";
import { useWallet } from "./wallet";
import { settleBuy } from "@/lib/pendingBuys";

interface TokenInvestmentProps {
  token: {
    mint: string;
    name: string;
    symbol: string;
    priceUsd?: number | null;
    imageUrl?: string | null;
  };
}

export function TokenInvestment({ token }: TokenInvestmentProps) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [resumed, setResumed] = useState<string | null>(null);

  /*
   * Phone path: the page came back from the wallet app carrying this
   * token's investment signature. The modal that asked for it is long
   * gone, so reopen it straight into the receipt.
   */
  useEffect(() => {
    const r = w.takeDeeplinkResult("invest");
    if (!r) return;
    const d = (r.data ?? {}) as {
      tokenMint?: string;
      amountUsdt?: number;
      priceUsd?: number | null;
    };
    if (d.tokenMint !== token.mint) return;
    setResumed(r.signature);
    setOpen(true);

    /*
     * The modal that started this buy is gone with the page it was on, so
     * its ledger credit happens here. Queued first, then confirmed; the
     * provider re-drives the queue if this attempt doesn't land.
     */
    if (typeof d.amountUsdt === "number" && d.amountUsdt > 0) {
      void settleBuy({
        signature: r.signature,
        address: w.session ?? w.address ?? "",
        tokenMint: token.mint,
        amountUsdt: d.amountUsdt,
        priceUsd: typeof d.priceUsd === "number" ? d.priceUsd : null,
      });
    }
    // Runs once, for the load that carries the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white transition hover:brightness-110 active:brightness-95"
      >
        Invest in {token.symbol}
      </button>

      <InvestModal
        open={open}
        onClose={() => { setOpen(false); setResumed(null); }}
        token={token}
        resumedSignature={resumed}
        onSuccess={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
