"use client";

import { useState } from "react";
import { InvestModal } from "./InvestModal";

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
  const [open, setOpen] = useState(false);

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
        onClose={() => setOpen(false)}
        token={token}
        onSuccess={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
