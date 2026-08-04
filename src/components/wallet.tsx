"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Minimal live wallet layer over the injected Solana provider (Phantom,
 * Solflare, Backpack all expose window.solana / window.phantom.solana).
 * No adapter dependency: connect, remember the pubkey, read balances from
 * public RPC. Swap execution is a later step — but the connection is real.
 */

interface InjectedProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    solana?: InjectedProvider;
    phantom?: { solana?: InjectedProvider };
  }
}

const RPC = "https://api.mainnet-beta.solana.com";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const j = await res.json();
    return (j.result as T) ?? null;
  } catch {
    return null;
  }
}

export interface WalletState {
  address: string | null;
  connecting: boolean;
  /** Provider detected in this browser. */
  available: boolean;
  solBalance: number | null;
  usdcBalance: number | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** UI balance of an arbitrary SPL mint for the connected wallet. */
  tokenBalance: (mint: string) => Promise<number | null>;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [available, setAvailable] = useState(false);
  const [solBalance, setSol] = useState<number | null>(null);
  const [usdcBalance, setUsdc] = useState<number | null>(null);

  const provider = useCallback((): InjectedProvider | null => {
    if (typeof window === "undefined") return null;
    return window.phantom?.solana ?? window.solana ?? null;
  }, []);

  const refreshBalances = useCallback(async (addr: string) => {
    const [lamports, usdc] = await Promise.all([
      rpc<{ value: number }>("getBalance", [addr]),
      rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }[] }>(
        "getTokenAccountsByOwner",
        [addr, { mint: USDC_MINT }, { encoding: "jsonParsed" }]
      ),
    ]);
    setSol(lamports ? lamports.value / 1e9 : null);
    setUsdc(
      usdc?.value?.length
        ? usdc.value.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0)
        : 0
    );
  }, []);

  useEffect(() => {
    const p = provider();
    setAvailable(!!p);
    if (!p) return;
    // silently restore a previously-approved session
    p.connect({ onlyIfTrusted: true })
      .then((r) => {
        const a = r.publicKey.toString();
        setAddress(a);
        void refreshBalances(a);
      })
      .catch(() => {});
    p.on?.("accountChanged", () => {
      const a = p.publicKey?.toString() ?? null;
      setAddress(a);
      if (a) void refreshBalances(a);
    });
  }, [provider, refreshBalances]);

  const connect = useCallback(async () => {
    const p = provider();
    if (!p) {
      window.open("https://phantom.com", "_blank", "noopener");
      return;
    }
    setConnecting(true);
    try {
      const r = await p.connect();
      const a = r.publicKey.toString();
      setAddress(a);
      void refreshBalances(a);
    } catch {
      /* user dismissed */
    } finally {
      setConnecting(false);
    }
  }, [provider, refreshBalances]);

  const disconnect = useCallback(async () => {
    try { await provider()?.disconnect(); } catch { /* noop */ }
    setAddress(null); setSol(null); setUsdc(null);
  }, [provider]);

  const tokenBalance = useCallback(async (mint: string) => {
    if (!address) return null;
    const r = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }[] }>(
      "getTokenAccountsByOwner",
      [address, { mint }, { encoding: "jsonParsed" }]
    );
    if (!r?.value) return null;
    return r.value.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
  }, [address]);

  const value = useMemo(
    () => ({ address, connecting, available, solBalance, usdcBalance, connect, disconnect, tokenBalance }),
    [address, connecting, available, solBalance, usdcBalance, connect, disconnect, tokenBalance]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
