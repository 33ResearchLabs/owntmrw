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
  /** Phantom returns the detached signature over the raw message bytes. */
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
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
/** Original SPL Token, then Token-2022. A mint under either is a real balance. */
const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

/**
 * Signature bytes for the wire. Base64 rather than the base58 Solana usually
 * uses, because base58 would mean shipping an encoder to the browser to
 * serialise one 64-byte array — the server decodes either just as easily.
 */
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

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
  /** Address of the signed-in session, or null. Distinct from `address`,
   *  which only says a wallet is connected in this browser. */
  session: string | null;
  /** True while a login is in flight, including the wallet popup. */
  signingIn: boolean;
  /**
   * Connect if needed, then prove control of the key: fetch a challenge,
   * sign it, and hand the signature back for verification. Resolves to an
   * error string, or null on success.
   */
  login: () => Promise<string | null>;
  logout: () => Promise<void>;
  /** UI balance of an arbitrary SPL mint for the connected wallet. */
  tokenBalance: (mint: string) => Promise<number | null>;
  /** Every non-zero SPL balance as mint -> amount. Null when the read failed. */
  allTokenBalances: () => Promise<Map<string, number> | null>;
}

const Ctx = createContext<WalletState | null>(null);

/**
 * `initialSession` is the signed-in address as the server already knew it, read
 * from the session cookie in `layout.tsx`. Without it the first client render
 * always says "signed out" and corrects itself once the fetch below lands,
 * which is fine for a balance but not for anything that decides what to render
 * — the nav would paint its signed-out shape and then shift. Seeding it makes
 * the first paint the true one; the fetch stays as the refresh.
 */
export function WalletProvider({
  children,
  initialSession = null,
}: {
  children: React.ReactNode;
  initialSession?: string | null;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [available, setAvailable] = useState(false);
  const [session, setSession] = useState<string | null>(initialSession);
  const [signingIn, setSigningIn] = useState(false);
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

  // A session lives in an httpOnly cookie, which script cannot read — so the
  // signed-in state has to be asked for once on mount rather than inferred.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((j: { address: string | null }) => { if (!cancelled) setSession(j.address); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  /**
   * Sign in.
   *
   * Connecting alone proves nothing — a public key is public, and any page can
   * ask for one. The signature over a server-issued nonce is the only step
   * here that demonstrates control of the key, so the session is opened by the
   * server on the strength of that and nothing else.
   */
  const login = useCallback(async (): Promise<string | null> => {
    const p = provider();
    if (!p) {
      window.open("https://phantom.com", "_blank", "noopener");
      return "No Solana wallet detected in this browser.";
    }
    setSigningIn(true);
    try {
      const addr = p.publicKey?.toString() ?? (await p.connect()).publicKey.toString();
      setAddress(addr);
      void refreshBalances(addr);

      if (!p.signMessage) return "This wallet cannot sign messages.";

      const nRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      if (!nRes.ok) return "Could not start sign-in. Try again.";
      const { nonce, message } = (await nRes.json()) as { nonce: string; message: string };

      const { signature } = await p.signMessage(new TextEncoder().encode(message), "utf8");

      const vRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr, nonce, signature: toBase64(signature) }),
      });
      if (!vRes.ok) {
        const { error } = (await vRes.json().catch(() => ({}))) as { error?: string };
        return error ?? "Signature rejected.";
      }
      setSession(addr);
      return null;
    } catch {
      // Rejecting the popup lands here, and is not an error worth shouting
      // about — the user changed their mind.
      return "Sign-in cancelled.";
    } finally {
      setSigningIn(false);
    }
  }, [provider, refreshBalances]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null);
  }, []);

  const tokenBalance = useCallback(async (mint: string) => {
    if (!address) return null;
    const r = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }[] }>(
      "getTokenAccountsByOwner",
      [address, { mint }, { encoding: "jsonParsed" }]
    );
    if (!r?.value) return null;
    return r.value.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
  }, [address]);

  /**
   * Every SPL balance the wallet holds, as mint → UI amount.
   *
   * Two calls rather than one per token: asking by `programId` returns the
   * whole account list at once, so checking a wallet against twenty-one mints
   * costs the same as checking it against one. Per-mint lookups would be
   * twenty-one requests at a public RPC that rate-limits, which is how a
   * portfolio ends up half-populated and looking like a loss.
   *
   * Both token programs, because a mint issued under Token-2022 is invisible
   * to a query for the original program and would read as a zero balance.
   */
  const allTokenBalances = useCallback(async () => {
    if (!address) return null;
    const out = new Map<string, number>();
    const results = await Promise.all(
      TOKEN_PROGRAMS.map((programId) =>
        rpc<{
          value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } } }[];
        }>("getTokenAccountsByOwner", [address, { programId }, { encoding: "jsonParsed" }])
      )
    );
    // A null result is a failed call, not an empty wallet — surface nothing
    // rather than an all-zero portfolio.
    if (results.every((r) => r == null)) return null;
    for (const r of results) {
      for (const a of r?.value ?? []) {
        const { mint, tokenAmount } = a.account.data.parsed.info;
        const amt = tokenAmount.uiAmount ?? 0;
        if (amt > 0) out.set(mint, (out.get(mint) ?? 0) + amt);
      }
    }
    return out;
  }, [address]);

  const value = useMemo(
    () => ({ address, connecting, available, solBalance, usdcBalance, session, signingIn, connect, disconnect, login, logout, tokenBalance, allTokenBalances }),
    [address, connecting, available, solBalance, usdcBalance, session, signingIn, connect, disconnect, login, logout, tokenBalance, allTokenBalances]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
