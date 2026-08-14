import type { Project, Governance } from "../db";

const MARKET_API = "https://market-api.metadao.fi";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const REALMS_PROGRAM_ID = "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";

const FUTARCHY_PROGRAM_ID = "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq";

type DetectResult = Omit<Governance, "project_id">;

type Ticker = {
  ticker_id: string;
  base_currency: string;
  base_symbol: string;
  base_name: string;
  pool_id: string;
  last_price: string;
  liquidity_in_usd: string;
  treasury_usdc_aum: string;
  treasury_vault_address: string;
  startDate: string;
};

type RpcAccount = {
  pubkey: string;
  account: {
    data: [string, string];
    owner: string;
    lamports: number;
    executable: boolean;
    space: number;
  };
};

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

function emptyGovernance(mint?: string): DetectResult {
  return {
    detected: 0,
    type: "unknown",
    protocol: null,

    governance_address: null,
    governance_program: null,

    voting_model: null,
    voting_token: mint ?? null,

    proposal_count: 0,
    active_proposals: 0,
    passed_proposals: 0,
    failed_proposals: 0,

    quorum: null,
    approval_threshold: null,

    treasury_address: null,

    mint_authority: null,
    freeze_authority: null,

    source_url: null,
    updated_ts: nowTs(),
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": BROWSER_UA,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `[governance] ${response.status} ${response.statusText}: ${url}`,
      );
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`[governance] fetch failed: ${url}`, error);
    return null;
  }
}

async function rpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      result?: T;
      error?: {
        code?: number;
        message?: string;
      };
    };

    if (json.error) {
      return null;
    }

    return json.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Verify that the token is actually one of the DAOs
 * exposed by MetaDAO's own public market API.
 */
async function detectMetaDAO(project: Project): Promise<DetectResult | null> {
  if (!project.mint) {
    return null;
  }

  const tickers = await fetchJson<Ticker[]>(`${MARKET_API}/api/tickers`);

  if (!Array.isArray(tickers)) {
    return null;
  }

  const match = tickers.find((ticker) => ticker.base_currency === project.mint);

  if (!match) {
    return null;
  }

  return {
    detected: 1,
    type: "metadao",
    protocol: "MetaDAO",

    // The ticker feed gives us the DAO's treasury vault,
    // but not necessarily a separate DAO address.
    governance_address: null,
    governance_program: FUTARCHY_PROGRAM_ID,

    voting_model: "Futarchy / decision markets",
    voting_token: project.mint,

    proposal_count: 0,
    active_proposals: 0,
    passed_proposals: 0,
    failed_proposals: 0,

    quorum: null,
    approval_threshold: null,

    treasury_address:
      match.treasury_vault_address || project.treasury_address || null,

    mint_authority: null,
    freeze_authority: null,

    source_url: "https://www.metadao.fi/proposals",

    updated_ts: nowTs(),
  };
}

/**
 * Lightweight Realms signal.
 *
 * This is intentionally NOT treated as definitive governance.
 * We only return Realms when an SPL Governance-owned account
 * contains the token mint.
 */
async function detectRealms(project: Project): Promise<DetectResult | null> {
  if (!project.mint) {
    return null;
  }

  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

  const accounts = await rpc<RpcAccount[]>(rpcUrl, "getProgramAccounts", [
    REALMS_PROGRAM_ID,
    {
      encoding: "base64",
    },
  ]);

  if (!accounts?.length) {
    return null;
  }

  const mint = Buffer.from(
    // base58 decode is intentionally avoided here.
    // Use web3 only in this adapter if we get a positive signal.
    project.mint,
    "utf8",
  );

  for (const account of accounts) {
    const [encoded, encoding] = account.account.data;

    if (encoding !== "base64") {
      continue;
    }

    let bytes: Buffer;

    try {
      bytes = Buffer.from(encoded, "base64");
    } catch {
      continue;
    }

    // Avoid claiming a match from arbitrary bytes.
    // We only use this as a preliminary signal.
    if (bytes.length < 32) {
      continue;
    }

    if (bytes.includes(mint)) {
      return {
        detected: 1,
        type: "realms",
        protocol: "Realms / SPL Governance",

        governance_address: account.pubkey,
        governance_program: REALMS_PROGRAM_ID,

        voting_model: "Token weighted",
        voting_token: project.mint,

        proposal_count: 0,
        active_proposals: 0,
        passed_proposals: 0,
        failed_proposals: 0,

        quorum: null,
        approval_threshold: null,

        treasury_address: project.treasury_address ?? null,

        mint_authority: null,
        freeze_authority: null,

        source_url: "https://app.realms.today/",

        updated_ts: nowTs(),
      };
    }
  }

  return null;
}

export async function detectGovernance(
  project: Project,
): Promise<DetectResult> {
  const empty = emptyGovernance(project.mint ?? undefined);

  if (!project.mint) {
    return empty;
  }

  /**
   * 1. MetaDAO
   *
   * This is the most reliable detector for your current
   * dataset because the existing MetaDAO API itself discovers
   * the DAOs.
   */
  const metaDAO = await detectMetaDAO(project);

  if (metaDAO) {
    return metaDAO;
  }

  /**
   * 2. Realms
   */
  const realms = await detectRealms(project);

  if (realms) {
    return realms;
  }

  /**
   * 3. Unknown
   *
   * Never call this "none" merely because we didn't find
   * MetaDAO or Realms.
   */
  return empty;
}
