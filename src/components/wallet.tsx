"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  DEEPLINK_BASE,
  DeeplinkProvider,
  consumeRedirect,
  isDeeplinkProvider,
  isTouchDevice,
  onContinueNeeded,
  signatureBytes,
  takeResult,
  type ContinueWhat,
  type DeeplinkResult,
} from "@/lib/walletDeeplink";
import { wdebug } from "@/lib/walletDebug";

const SOLANA_NETWORK = "devnet";

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

const BALANCES_URL = "/api/wallet/balances";

interface InjectedProvider {
  isPhantom?: boolean;

  publicKey?: {
    toString(): string;
  } | null;

  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{
    publicKey: {
      toString(): string;
    };
  }>;

  disconnect(): Promise<void>;

  /**
   * Sign an arbitrary message.
   */
  signMessage?(
    message: Uint8Array,
    encoding?: string,
  ): Promise<{
    signature: Uint8Array;
  }>;

  /**
   * Sign a Solana transaction.
   *
   * We intentionally keep the transaction type as unknown here because
   * the wallet provider is injected by the browser. The actual object
   * passed from TradeTerminal is a Solana Transaction.
   */
  signTransaction?(transaction: unknown): Promise<unknown>;

  /**
   * Sign and send a Solana transaction.
   *
   * Phantom/Solana-compatible providers return an object containing
   * the transaction signature.
   */
  signAndSendTransaction?(
    transaction: unknown,
    options?: unknown,
  ): Promise<{
    signature: string;
  }>;

  on?(event: string, cb: (...args: unknown[]) => void): void;
}

/**
 * ============================================================
 * WINDOW WALLET TYPES
 * ============================================================
 */

declare global {
  interface Window {
    solana?: InjectedProvider;

    phantom?: {
      solana?: InjectedProvider;
    };

    solflare?: InjectedProvider;

    backpack?: InjectedProvider;
  }
}

/**
 * ============================================================
 * WALLET METADATA
 * ============================================================
 */

export interface WalletMeta {
  id: string;
  name: string;
  installUrl: string;
  detect: () => InjectedProvider | null;
}

/**
 * ============================================================
 * SUPPORTED WALLETS
 * ============================================================
 */

export const WALLETS: WalletMeta[] = [
  {
    id: "phantom",
    name: "Phantom",
    installUrl: "https://phantom.com",

    detect: () =>
      typeof window === "undefined"
        ? null
        : (window.phantom?.solana ??
          (window.solana?.isPhantom ? window.solana : null)),
  },

  {
    id: "solflare",
    name: "Solflare",
    installUrl: "https://solflare.com",

    detect: () =>
      typeof window === "undefined" ? null : (window.solflare ?? null),
  },

  {
    id: "backpack",
    name: "Backpack",
    installUrl: "https://backpack.app",

    detect: () =>
      typeof window === "undefined" ? null : (window.backpack ?? null),
  },
];

/**
 * ============================================================
 * PROVIDER LOOKUP
 * ============================================================
 *
 * Three places this page can be running, one provider API:
 *
 *   Desktop                      → `window.phantom` etc., injected by the extension
 *   The wallet's in-app browser  → the same injected object — the app injects it too
 *   Any other phone/tablet browser → `DeeplinkProvider`, the universal-link client
 *
 * Everything downstream calls the returned object's `connect` / `signMessage`
 * / `signAndSendTransaction` and never needs to know which of the three it
 * got. The deeplink one is built lazily and once per wallet; it holds no
 * state of its own, so building it is free.
 */

const deeplinkProviders = new Map<string, DeeplinkProvider>();

function deeplinkFor(id: string): DeeplinkProvider | null {
  if (!isTouchDevice() || !DEEPLINK_BASE[id]) return null;
  let p = deeplinkProviders.get(id);
  if (!p) {
    p = new DeeplinkProvider(id);
    deeplinkProviders.set(id, p);
  }
  return p;
}

function providerFor(id: string): InjectedProvider | null {
  const injected = WALLETS.find((wallet) => wallet.id === id)?.detect();
  if (injected) return injected;
  return deeplinkFor(id);
}

/** True when this wallet is reached through its app rather than an extension. */
function viaApp(id: string): boolean {
  return !WALLETS.find((wallet) => wallet.id === id)?.detect() && deeplinkFor(id) != null;
}

/**
 * ============================================================
 * STORAGE
 * ============================================================
 */

const LAST_WALLET_KEY = "underly.lastWallet";

/**
 * ============================================================
 * BALANCE TYPES
 * ============================================================
 */

interface OwnerBalances {
  sol: number | null;

  usdt: number | null;

  usdtMint: string | null;

  usdtTokenAccount: string | null;

  tokens: Record<string, number> | null;
}

/**
 * ============================================================
 * FAILED BALANCE RESPONSE
 * ============================================================
 *
 * null means RPC/read failure.
 */

const FAILED: OwnerBalances = {
  sol: null,
  usdt: null,
  tokens: null,
  usdtMint: null,
  usdtTokenAccount: null,
};

/**
 * ============================================================
 * BALANCE CACHE
 * ============================================================
 */

const FRESH_MS = 15_000;

let balCache: {
  owner: string;
  at: number;
  data: OwnerBalances;
} | null = null;

let balInflight: {
  owner: string;
  promise: Promise<OwnerBalances>;
} | null = null;

/**
 * ============================================================
 * FETCH WALLET BALANCES
 * ============================================================
 */

async function fetchBalances(
  owner: string,
  force = false,
): Promise<OwnerBalances> {
  /**
   * Use cached balance for 15 seconds.
   */
  if (
    !force &&
    balCache?.owner === owner &&
    Date.now() - balCache.at < FRESH_MS
  ) {
    return balCache.data;
  }

  /**
   * Don't make duplicate requests while one is already running.
   */
  if (balInflight?.owner === owner) {
    return balInflight.promise;
  }

  const promise = (async () => {
    try {
      console.log(owner);
      const url = `${BALANCES_URL}?address=${encodeURIComponent(owner)}`;

      console.log("[WALLET] Fetching balances:", url);

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      /**
       * Authentication / API failure.
       */
      if (!res.ok) {
        console.error("[WALLET] Balance API failed:", res.status);

        return FAILED;
      }

      const data = (await res.json()) as OwnerBalances;

      console.log("[WALLET] Balance API response:", data);

      /**
       * Cache successful response.
       */
      balCache = {
        owner,
        at: Date.now(),
        data,
      };

      return data;
    } catch (error) {
      console.error("[WALLET] Balance request failed:", error);

      return FAILED;
    } finally {
      balInflight = null;
    }
  })();

  balInflight = {
    owner,
    promise,
  };

  return promise;
}

/**
 * ============================================================
 * BASE64 SIGNATURE
 * ============================================================
 */

function toBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/**
 * ============================================================
 * WALLET STATE
 * ============================================================
 */

export interface WalletState {
  /**
   * Connected wallet address.
   */
  address: string | null;

  /**
   * Wallet connection in progress.
   */
  connecting: boolean;

  /**
   * At least one supported wallet exists.
   */
  available: boolean;

  /**
   * Usable wallet IDs — installed as an extension, or reachable through
   * the wallet's app on a phone or tablet.
   */
  installedWallets: string[];

  /**
   * The subset of `installedWallets` reached through the app rather than
   * an extension. The sign-in list labels these "Opens the Phantom app".
   */
  appWallets: string[];

  /**
   * A wallet-app request is paused waiting for a tap — see the tap gate in
   * `walletDeeplink.ts`. The UI shows this and calls `resume` on the tap.
   */
  continueNeeded: { what: ContinueWhat; resume: () => void } | null;

  /**
   * Something the last wallet-app round-trip wants the reader to know:
   * a decline, a stalled open, a failed sign-in. Cleared by `dismissNotice`.
   */
  notice: string | null;

  dismissNotice: () => void;

  /**
   * Claim the answer of a wallet-app round-trip that finished on this page
   * load. A flow that hands `resume` to `signAndSendTransaction` gets the
   * same `tag`/`data` back here, with the signature, once the page returns.
   */
  takeDeeplinkResult: (tag: string) => { signature: string; data: unknown } | null;

  /**
   * Currently active wallet.
   */
  activeWallet: string | null;

  /**
   * Native SOL balance.
   */
  solBalance: number | null;

  /**
   * Devnet USDT balance.
   */
  usdtBalance: number | null;

  /**
   * Alias for stable USD balance used by portfolio UI.
   * USDT is the app's stablecoin balance for this wallet.
   */
  usdcBalance: number | null;

  /**
   * Authenticated session address.
   */
  session: string | null;

  /**
   * Sign-in in progress.
   */
  signingIn: boolean;

  /**
   * Connect wallet.
   */
  connect: (walletId?: string) => Promise<void>;

  /**
   * Disconnect wallet.
   */
  disconnect: () => Promise<void>;

  /**
   * Sign in using wallet signature. `next` is where to land once a session
   * exists — only used on the phone path, where the page reloads between
   * steps and the caller that knew the destination is gone by the end.
   */
  login: (walletId?: string, opts?: { next?: string | null }) => Promise<string | null>;

  /**
   * Logout.
   */
  logout: () => Promise<void>;

  /**
   * Re-read the session from the server: the address it recognises, null
   * when signed out, undefined when it could not be reached (the session is
   * then left as it was — an unreachable server is not a sign-out). Call it
   * when an API answers 401: `session` is a snapshot from page load, and the
   * server's can lapse under it — the session expires, or a deploy rebuilds
   * the database — so this is how the UI stops showing a green dot for a
   * session that no longer exists.
   */
  refreshSession: () => Promise<string | null | undefined>;

  /**
   * Get balance for a specific SPL mint.
   */
  tokenBalance: (mint: string) => Promise<number | null>;

  /**
   * Get every non-zero SPL balance.
   */
  allTokenBalances: () => Promise<Map<string, number> | null>;

  /**
   * Get the simulated (ledger) position for one mint.
   */
  ledgerBalance: (mint: string) => Promise<number>;

  /**
   * Get every simulated position, mint -> amount.
   */
  allLedgerBalances: () => Promise<Map<string, number>>;

  /**
   * Sign a Solana transaction with the connected wallet.
   */
  signTransaction: (transaction: unknown) => Promise<unknown>;

  /**
   * Sign and send a Solana transaction.
   *
   * `resume` is only meaningful on the phone path, where approving means
   * leaving for the wallet app and coming back on a fresh page load: it is
   * what `takeDeeplinkResult(tag)` hands back then, so the caller can
   * finish what it started (record the trade, show the receipt). Callers
   * on an extension get the signature from the returned promise as before.
   */
  signAndSendTransaction: (
    transaction: unknown,
    resume?: { tag: string; data?: unknown },
  ) => Promise<string>;

  /**
   * Current network.
   */
  network: string;

  /**
   * Current RPC URL.
   */
  rpcUrl: string;
}

/**
 * ============================================================
 * CONTEXT
 * ============================================================
 */

const Ctx = createContext<WalletState | null>(null);

/**
 * ============================================================
 * WALLET PROVIDER
 * ============================================================
 */

export function WalletProvider({
  children,
  initialSession = null,
}: {
  children: React.ReactNode;
  initialSession?: string | null;
}) {
  /**
   * Wallet address.
   */
  const [address, setAddress] = useState<string | null>(null);

  /**
   * Connection state.
   */
  const [connecting, setConnecting] = useState(false);

  /**
   * Installed wallets.
   */
  const [installedWallets, setInstalledWallets] = useState<string[]>([]);

  /**
   * Active wallet.
   */
  const [activeWallet, setActiveWallet] = useState<string | null>(null);

  /**
   * Server session.
   */
  const [session, setSession] = useState<string | null>(initialSession);

  /**
   * Login state.
   */
  const [signingIn, setSigningIn] = useState(false);

  /**
   * SOL balance.
   */
  const [solBalance, setSol] = useState<number | null>(null);

  /**
   * USDT balance.
   */
  const [usdtBalance, setUsdt] = useState<number | null>(null);

  /**
   * Wallets reached through their app (phone/tablet path).
   */
  const [appWallets, setAppWallets] = useState<string[]>([]);

  /**
   * A paused wallet-app request waiting for a tap.
   */
  const [continueNeeded, setContinueNeeded] = useState<WalletState["continueNeeded"]>(null);

  /**
   * Message from the last wallet-app round-trip.
   */
  const [notice, setNotice] = useState<string | null>(null);

  const router = useRouter();

  /**
   * ==========================================================
   * TAP GATE
   * ==========================================================
   *
   * The deeplink client asks here before opening the wallet app from
   * outside a tap. The promise it gets resolves when the reader taps the
   * prompt — `ContinueToast` and the header button both call `resume`.
   */

  useEffect(() => {
    onContinueNeeded(
      (what) =>
        new Promise<void>((resolve) => {
          setContinueNeeded({
            what,
            resume: () => {
              setContinueNeeded(null);
              resolve();
            },
          });
        }),
    );
    return () => onContinueNeeded(null);
  }, []);

  /**
   * ==========================================================
   * GET ACTIVE PROVIDER
   * ==========================================================
   */

  const provider = useCallback(
    (walletId?: string): InjectedProvider | null => {
      const id = walletId ?? activeWallet ?? installedWallets[0];

      return id ? providerFor(id) : null;
    },
    [activeWallet, installedWallets],
  );

  /**
   * ==========================================================
   * REFRESH BALANCES
   * ==========================================================
   */

  const refreshBalances = useCallback(async (addr: string) => {
    const { sol, usdt } = await fetchBalances(addr);

    setSol(sol);
    setUsdt(usdt);
  }, []);

  /**
   * ==========================================================
   * LOGIN PIECES
   * ==========================================================
   *
   * Split out of `login` because the phone path runs them across page
   * loads: `challenge` before leaving for the app to sign, `verify` after
   * coming back with the signature. The extension path runs both in one
   * call, exactly as before.
   */

  const challenge = useCallback(
    async (addr: string): Promise<{ nonce: string; message: string } | null> => {
      const res = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr, network: SOLANA_NETWORK }),
      });
      if (!res.ok) return null;
      return (await res.json()) as { nonce: string; message: string };
    },
    [],
  );

  /** Returns an error string, or null once the session exists. */
  const verify = useCallback(
    async (addr: string, nonce: string, signature: Uint8Array): Promise<string | null> => {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: addr,
          nonce,
          signature: toBase64(signature),
          network: SOLANA_NETWORK,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return data.error ?? "Signature rejected.";
      }
      setSession(addr);
      await refreshBalances(addr);
      return null;
    },
    [refreshBalances],
  );

  /**
   * ==========================================================
   * RESUME LOGIN (phone / tablet)
   * ==========================================================
   *
   * The page came back from the wallet app carrying one of the two answers
   * a sign-in asks for. After `connect` it goes straight on to ask for the
   * signature — through the tap gate, since no tap is live now. After
   * `signMessage` it verifies and lands the reader where they were headed.
   */

  const resumeLogin = useCallback(
    async (r: DeeplinkResult) => {
      const data = (r.data ?? {}) as { next?: string | null; address?: string; nonce?: string };
      const p = deeplinkFor(r.wallet);
      if (!p) return;

      setSigningIn(true);
      try {
        if (r.method === "connect") {
          const addr = String(r.payload.public_key ?? "");
          if (!addr) throw new Error("Wallet returned no address.");

          setActiveWallet(r.wallet);
          setAddress(addr);
          void refreshBalances(addr);

          const c = await challenge(addr);
          if (!c) throw new Error("Could not start sign-in. Try again.");

          wdebug("resume login: connected", addr, "— asking for signature");
          await p.signMessage(new TextEncoder().encode(c.message), "utf8", {
            tag: "login",
            data: { next: data.next ?? null, address: addr, nonce: c.nonce },
          });
          return;
        }

        if (r.method === "signMessage" && data.address && data.nonce) {
          wdebug("resume login: verifying signature for", data.address);
          const err = await verify(data.address, data.nonce, signatureBytes(r.payload));
          if (err) throw new Error(err);

          /**
           * Same rule as `WalletModal.onDone`: a gated link finishes its
           * journey (as a full navigation, so no stale prefetched redirect
           * can send it back to `/login`); otherwise the page refetches
           * with the new cookie.
           */
          if (data.next) window.location.assign(data.next);
          else router.refresh();
        }
      } catch (error) {
        wdebug("resume login failed", error);
        setNotice(error instanceof Error ? error.message : "Sign-in failed.");
      } finally {
        setSigningIn(false);
      }
    },
    [challenge, verify, refreshBalances, router],
  );

  /**
   * ==========================================================
   * DETECT WALLETS
   * ==========================================================
   */

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    /**
     * First: did this page load *come back* from a wallet app? Must run
     * before anything else reads the store, since a connect response is
     * what puts the session there.
     */
    const back = consumeRedirect();
    if (back?.error) {
      setNotice(back.error);
    }

    const installed = WALLETS.filter((wallet) => providerFor(wallet.id)).map(
      (wallet) => wallet.id,
    );

    setInstalledWallets(installed);
    setAppWallets(installed.filter(viaApp));

    if (!installed.length) {
      return;
    }

    /**
     * Reconnect last-used wallet.
     */
    const remembered = localStorage.getItem(LAST_WALLET_KEY);

    const id =
      remembered && installed.includes(remembered) ? remembered : installed[0];

    const p = providerFor(id);

    if (!p) {
      return;
    }

    /**
     * Silent reconnect. On the phone path this reads the session the
     * deeplink store already holds; it never opens the app.
     */
    p.connect({
      onlyIfTrusted: true,
    })
      .then((result) => {
        const walletAddress = result.publicKey.toString();

        setActiveWallet(id);
        setAddress(walletAddress);

        void refreshBalances(walletAddress);
      })
      .catch(() => {
        /**
         * Silent reconnect failed.
         */
      });

    /**
     * A sign-in that left for the app comes back here, one step further on.
     */
    if (back?.result?.tag === "login") {
      takeResult("login");
      void resumeLogin(back.result);
    }

    /**
     * Account changes.
     */
    p.on?.("accountChanged", () => {
      const walletAddress = p.publicKey?.toString() ?? null;

      setAddress(walletAddress);

      if (walletAddress) {
        void refreshBalances(walletAddress);
      } else {
        setSol(null);
        setUsdt(null);

        balCache = null;
      }
    });
  }, [refreshBalances, resumeLogin]);

  /**
   * ==========================================================
   * SERVER SESSION
   * ==========================================================
   */

  /**
   * Ask the server who the cookie belongs to. Runs once on mount, and again
   * on demand when an API call answers 401 (see `WalletState.refreshSession`
   * for the contract).
   */
  const refreshSession = useCallback(
    () =>
      fetch("/api/auth/session", { cache: "no-store" })
        .then((res) => res.json())
        .then((data: { address: string | null }) => {
          setSession(data.address);
          return data.address;
        })
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  /**
   * ==========================================================
   * CONNECT
   * ==========================================================
   */

  const connect = useCallback(
    async (walletId?: string) => {
      const id = walletId ?? activeWallet ?? installedWallets[0];

      const p = id ? providerFor(id) : null;

      /**
       * Wallet not installed.
       */
      if (!p) {
        const fallback =
          WALLETS.find((wallet) => wallet.id === walletId) ?? WALLETS[0];

        window.open(fallback.installUrl, "_blank", "noopener,noreferrer");

        return;
      }

      setConnecting(true);

      try {
        const result = await p.connect();

        const walletAddress = result.publicKey.toString();

        setActiveWallet(id!);

        localStorage.setItem(LAST_WALLET_KEY, id!);

        setAddress(walletAddress);

        await refreshBalances(walletAddress);
      } catch (error) {
        /**
         * User cancelled — or, on a phone, the app never opened.
         */
        if (isDeeplinkProvider(p) && error instanceof Error) {
          setNotice(error.message);
        }
      } finally {
        setConnecting(false);
      }
    },
    [activeWallet, installedWallets, refreshBalances],
  );

  /**
   * ==========================================================
   * DISCONNECT
   * ==========================================================
   */

  const disconnect = useCallback(async () => {
    try {
      await provider()?.disconnect();
    } catch {
      /**
       * Ignore disconnect errors.
       */
    }

    setAddress(null);
    setSol(null);
    setUsdt(null);
    setActiveWallet(null);

    localStorage.removeItem(LAST_WALLET_KEY);

    balCache = null;
    balInflight = null;
  }, [provider]);

  /**
   * ==========================================================
   * LOGIN
   * ==========================================================
   */

  const login = useCallback(
    async (walletId?: string, opts?: { next?: string | null }): Promise<string | null> => {
      const id = walletId ?? activeWallet ?? installedWallets[0];

      const p = id ? providerFor(id) : null;

      /**
       * Wallet not installed.
       */
      if (!p) {
        const fallback =
          WALLETS.find((wallet) => wallet.id === walletId) ?? WALLETS[0];

        window.open(fallback.installUrl, "_blank", "noopener,noreferrer");

        return `${fallback.name} isn't installed in this browser.`;
      }

      setSigningIn(true);
      setNotice(null);

      try {
        /**
         * ==================================================
         * PHONE / TABLET: LEAVE FOR THE APP
         * ==================================================
         *
         * Each of these navigates away and never returns; the
         * flow continues in `resumeLogin` on the next page load.
         * The `login` tag and `next` ride along in the store.
         */
        if (isDeeplinkProvider(p)) {
          setActiveWallet(id!);
          localStorage.setItem(LAST_WALLET_KEY, id!);

          const known = p.publicKey?.toString();
          if (!known) {
            await p.connectVia({ tag: "login", data: { next: opts?.next ?? null } });
          }

          const c = await challenge(known!);
          if (!c) return "Could not start sign-in. Try again.";

          await p.signMessage(new TextEncoder().encode(c.message), "utf8", {
            tag: "login",
            data: { next: opts?.next ?? null, address: known, nonce: c.nonce },
          });
        }

        /**
         * Get wallet address.
         */
        const addr =
          p.publicKey?.toString() ?? (await p.connect()).publicKey.toString();

        setActiveWallet(id!);

        localStorage.setItem(LAST_WALLET_KEY, id!);

        setAddress(addr);

        void refreshBalances(addr);

        /**
         * Wallet needs message signing.
         */
        if (!p.signMessage) {
          return "This wallet cannot sign messages.";
        }

        const c = await challenge(addr);
        if (!c) return "Could not start sign-in. Try again.";

        const { signature } = await p.signMessage(
          new TextEncoder().encode(c.message),
          "utf8",
        );

        return await verify(addr, c.nonce, signature);
      } catch (error) {
        console.error("[WALLET] Login failed:", error);

        /**
         * A stalled app-open carries a message worth showing; an
         * extension's reject is just a cancel.
         */
        if (isDeeplinkProvider(p) && error instanceof Error) {
          return error.message;
        }
        return "Sign-in cancelled.";
      } finally {
        setSigningIn(false);
      }
    },
    [activeWallet, installedWallets, refreshBalances, challenge, verify],
  );

  /**
   * ==========================================================
   * LOGOUT
   * ==========================================================
   */

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    }).catch(() => {});

    setSession(null);
  }, []);

  /**
   * ==========================================================
   * TOKEN BALANCE
   * ==========================================================
   *
   * Get any SPL token by mint.
   */

  const tokenBalance = useCallback(
    async (mint: string) => {
      if (!address) {
        return null;
      }

      const { tokens } = await fetchBalances(address);

      if (!tokens) {
        return null;
      }

      return tokens[mint] ?? 0;
    },
    [address],
  );

  /**
   * ==========================================================
   * ALL TOKEN BALANCES
   * ==========================================================
   */

  const allTokenBalances = useCallback(async () => {
    if (!address) {
      return null;
    }

    const data = await fetchBalances(address, true);
    console.log(data);
    /**
     * Keep the React wallet state synchronized with
     * the same fresh API response.
     */
    setSol(data.sol);
    if (data.tokens && Object.keys(data.tokens).length > 0) {
      const tokenEntries = Object.entries(data.tokens);

      const maxToken = tokenEntries.reduce((max, current) => {
        return current[1] > max[1] ? current : max;
      }, tokenEntries[0]);

      console.log("[WALLET] MAX TOKEN:", {
        mint: maxToken[0],
        balance: maxToken[1],
      });

      setUsdt(maxToken[1]);
    } else {
      setUsdt(0);
    }

    if (!data.tokens) {
      return null;
    }

    return new Map(Object.entries(data.tokens));
  }, [address]);

  /**
   * ==========================================================
   * LEDGER (SIMULATED) BALANCES
   * ==========================================================
   *
   * No vault inventory or mint authority exists for any tracked project
   * token (see `ledger_trades` in db.ts), so a completed buy is recorded as
   * a position in the app's own ledger rather than a real SPL transfer.
   * These read that ledger back, the same shape as `allTokenBalances`.
   */

  const allLedgerBalances = useCallback(async () => {
    if (!address) {
      return new Map<string, number>();
    }

    try {
      const res = await fetch("/api/positions", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!res.ok) {
        return new Map<string, number>();
      }

      const data = (await res.json()) as Record<string, number>;

      return new Map(Object.entries(data));
    } catch (error) {
      console.error("[WALLET] Ledger position request failed:", error);

      return new Map<string, number>();
    }
  }, [address]);

  const ledgerBalance = useCallback(
    async (mint: string) => {
      const all = await allLedgerBalances();

      return all.get(mint) ?? 0;
    },
    [allLedgerBalances],
  );

  /**
   * ==========================================================
   * SIGN TRANSACTION
   * ==========================================================
   *
   * Used when the application wants to:
   *
   * 1. Build a Solana transaction server-side.
   * 2. Send the transaction to the browser.
   * 3. Deserialize it into a Solana Transaction.
   * 4. Ask Phantom/Solflare/Backpack to sign it.
   *
   * IMPORTANT:
   * The wallet must never receive a plain JSON transaction.
   * TradeTerminal should deserialize the transaction first.
   */

  const signTransaction = useCallback(
    async (transaction: unknown): Promise<unknown> => {
      const p = provider();

      if (!p) {
        throw new Error("No wallet connected.");
      }

      if (!p.signTransaction) {
        throw new Error(
          "Wallet provider does not support transaction signing.",
        );
      }

      console.log("[WALLET] Requesting transaction signature...");

      const signed = await p.signTransaction(transaction);

      console.log("[WALLET] Transaction signed.");

      return signed;
    },
    [provider],
  );

  /**
   * ==========================================================
   * SIGN + SEND TRANSACTION
   * ==========================================================
   *
   * This is the method TradeTerminal should use for normal
   * investment execution.
   *
   * Flow:
   *
   * TradeTerminal
   *      ↓
   * /api/swap
   *      ↓
   * serialized transaction
   *      ↓
   * Transaction.deserialize(...)
   *      ↓
   * Phantom
   *      ↓
   * user approves
   *      ↓
   * Solana Devnet
   *      ↓
   * signature
   */

  const signAndSendTransaction = useCallback(
    async (
      transaction: unknown,
      resume?: { tag: string; data?: unknown },
    ): Promise<string> => {
      const p = provider();

      if (!p) {
        throw new Error("No wallet connected.");
      }

      if (!p.signAndSendTransaction) {
        throw new Error(
          "Wallet provider does not support sign-and-send transactions.",
        );
      }

      console.log("[WALLET] Requesting transaction approval...");

      /**
       * Phone path: this leaves for the app and never resolves. The
       * caller gets its `resume` back from `takeDeeplinkResult` on the
       * next page load, signature included.
       */
      if (isDeeplinkProvider(p)) {
        return p.signAndSendTransaction(transaction, undefined, resume);
      }

      const result = await p.signAndSendTransaction(transaction);

      if (!result || typeof result.signature !== "string") {
        throw new Error("Wallet did not return a transaction signature.");
      }

      console.log("[WALLET] Transaction submitted:", result.signature);

      /**
       * Refresh balances shortly after submission.
       *
       * The transaction may still be confirming, so we don't
       * assume the new balance is immediately available.
       */
      if (address) {
        window.setTimeout(() => {
          balCache = null;

          void refreshBalances(address);
        }, 1500);
      }

      return result.signature;
    },
    [provider, address, refreshBalances],
  );

  /**
   * ==========================================================
   * CONTEXT VALUE
   * ==========================================================
   */
  /**
   * ==========================================================
   * DEEPLINK RESULT HAND-OFF
   * ==========================================================
   */

  const takeDeeplinkResult = useCallback(
    (tag: string): { signature: string; data: unknown } | null => {
      const r = takeResult(tag);
      if (!r) return null;
      const signature = String(r.payload.signature ?? "");
      if (!signature) return null;
      wdebug("result claimed by", tag, signature);
      if (address) {
        balCache = null;
        void refreshBalances(address);
      }
      return { signature, data: r.data };
    },
    [address, refreshBalances],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<WalletState>(
    () => ({
      address,

      connecting,

      available: installedWallets.length > 0,

      installedWallets,

      appWallets,

      continueNeeded,

      notice,

      dismissNotice,

      takeDeeplinkResult,

      activeWallet,

      solBalance,

      usdtBalance,

      usdcBalance: usdtBalance,

      session,

      signingIn,

      connect,

      disconnect,

      login,

      logout,

      refreshSession,

      tokenBalance,

      allTokenBalances,

      ledgerBalance,

      allLedgerBalances,

      signTransaction,

      signAndSendTransaction,

      network: SOLANA_NETWORK,

      rpcUrl: SOLANA_RPC_URL,
    }),
    [
      address,
      connecting,
      installedWallets,
      appWallets,
      continueNeeded,
      notice,
      dismissNotice,
      takeDeeplinkResult,
      activeWallet,
      solBalance,
      usdtBalance,
      session,
      signingIn,
      connect,
      disconnect,
      login,
      logout,
      refreshSession,
      tokenBalance,
      allTokenBalances,
      ledgerBalance,
      allLedgerBalances,
      signTransaction,
      signAndSendTransaction,
    ],
  );

  /**
   * ==========================================================
   * PROVIDER
   * ==========================================================
   */

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * ============================================================
 * USE WALLET
 * ============================================================
 */

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);

  if (!ctx) {
    throw new Error("useWallet must be used inside WalletProvider");
  }

  return ctx;
}
