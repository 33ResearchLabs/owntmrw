"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * ============================================================
 * SOLANA DEVNET WALLET PROVIDER
 * ============================================================
 *
 * Supported wallets:
 * - Phantom
 * - Solflare
 * - Backpack
 *
 * Network:
 * - Solana Devnet
 *
 * Balances:
 * - SOL
 * - USDT
 * - All SPL tokens
 *
 * The actual balance RPC call is performed server-side by:
 *
 * /api/wallet/balances
 *
 * Transaction signing happens in the browser wallet.
 */

/**
 * ============================================================
 * NETWORK
 * ============================================================
 */

const SOLANA_NETWORK = "devnet";

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

/**
 * ============================================================
 * BALANCE API
 * ============================================================
 */

const BALANCES_URL = "/api/wallet/balances";

/**
 * ============================================================
 * INJECTED WALLET PROVIDER
 * ============================================================
 */

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
 */

function providerFor(id: string): InjectedProvider | null {
  return WALLETS.find((wallet) => wallet.id === id)?.detect() ?? null;
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
  /**
   * SOL balance.
   */
  sol: number | null;

  /**
   * Devnet USDT balance.
   */
  usdt: number | null;

  /**
   * All non-zero SPL balances.
   *
   * mint -> amount
   */
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
   * Installed wallet IDs.
   */
  installedWallets: string[];

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
   * Sign in using wallet signature.
   */
  login: (walletId?: string) => Promise<string | null>;

  /**
   * Logout.
   */
  logout: () => Promise<void>;

  /**
   * Get balance for a specific SPL mint.
   */
  tokenBalance: (mint: string) => Promise<number | null>;

  /**
   * Get every non-zero SPL balance.
   */
  allTokenBalances: () => Promise<Map<string, number> | null>;

  /**
   * Sign a Solana transaction with the connected wallet.
   */
  signTransaction: (transaction: unknown) => Promise<unknown>;

  /**
   * Sign and send a Solana transaction.
   */
  signAndSendTransaction: (transaction: unknown) => Promise<string>;

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
   * DETECT WALLETS
   * ==========================================================
   */

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const installed = WALLETS.filter((wallet) => wallet.detect()).map(
      (wallet) => wallet.id,
    );

    setInstalledWallets(installed);

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
     * Silent reconnect.
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
  }, [refreshBalances]);

  /**
   * ==========================================================
   * SERVER SESSION
   * ==========================================================
   */

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { address: string | null }) => {
        if (!cancelled) {
          setSession(data.address);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

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
      } catch {
        /**
         * User cancelled.
         */
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
    async (walletId?: string): Promise<string | null> => {
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

      try {
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

        /**
         * ==================================================
         * REQUEST NONCE
         * ==================================================
         */

        const nonceResponse = await fetch("/api/auth/nonce", {
          method: "POST",

          headers: {
            "content-type": "application/json",
          },

          body: JSON.stringify({
            address: addr,
            network: SOLANA_NETWORK,
          }),
        });

        if (!nonceResponse.ok) {
          return "Could not start sign-in. Try again.";
        }

        const { nonce, message } = (await nonceResponse.json()) as {
          nonce: string;
          message: string;
        };

        /**
         * ==================================================
         * SIGN MESSAGE
         * ==================================================
         */

        const { signature } = await p.signMessage(
          new TextEncoder().encode(message),
          "utf8",
        );

        /**
         * ==================================================
         * VERIFY
         * ==================================================
         */

        const verifyResponse = await fetch("/api/auth/verify", {
          method: "POST",

          headers: {
            "content-type": "application/json",
          },

          body: JSON.stringify({
            address: addr,
            nonce,
            signature: toBase64(signature),
            network: SOLANA_NETWORK,
          }),
        });

        if (!verifyResponse.ok) {
          const data = (await verifyResponse.json().catch(() => ({}))) as {
            error?: string;
          };

          return data.error ?? "Signature rejected.";
        }

        /**
         * Login successful.
         */
        setSession(addr);

        /**
         * Refresh balances after login.
         */
        await refreshBalances(addr);

        return null;
      } catch (error) {
        console.error("[WALLET] Login failed:", error);

        return "Sign-in cancelled.";
      } finally {
        setSigningIn(false);
      }
    },
    [activeWallet, installedWallets, refreshBalances],
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

    /**
     * Force a fresh read for portfolio.
     */
    const { tokens } = await fetchBalances(address, true);

    if (!tokens) {
      return null;
    }

    return new Map(Object.entries(tokens));
  }, [address]);

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
    async (transaction: unknown): Promise<string> => {
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

  const value = useMemo<WalletState>(
    () => ({
      address,

      connecting,

      available: installedWallets.length > 0,

      installedWallets,

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

      tokenBalance,

      allTokenBalances,

      signTransaction,

      signAndSendTransaction,

      network: SOLANA_NETWORK,

      rpcUrl: SOLANA_RPC_URL,
    }),
    [
      address,
      connecting,
      installedWallets,
      activeWallet,
      solBalance,
      usdtBalance,
      session,
      signingIn,
      connect,
      disconnect,
      login,
      logout,
      tokenBalance,
      allTokenBalances,
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
