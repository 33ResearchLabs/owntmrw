/**
 * Organisation detection for holder wallets.
 *
 * A holder is classified by evidence, not by guesswork, and every verdict
 * carries the reason that produced it so the UI can show *why* a wallet is
 * called an organisation. Ordered most-authoritative first.
 *
 * Signals available without a keyed RPC:
 *  1. On-chain role — the address IS a known protocol account for this project
 *     (DAO treasury vault, launch vault, AMM pool). Definitive.
 *  2. Registry match — a documented exchange/market-maker/program address.
 *  3. Cross-project presence — the same wallet is a top holder of several
 *     MetaDAO projects. Individuals rarely place top-20 across many raises.
 *  4. Program ownership — the account is owned by a program rather than a
 *     system-owned keypair, so it is a contract (vault, escrow, pool).
 */

import { KNOWN_WALLETS, type EntityType } from "./sources/wallets";

export type Confidence = "confirmed" | "likely" | "inferred";

export interface OrgVerdict {
  /** Display label, e.g. "Coinbase" or "DAO Treasury". */
  label: string;
  type: EntityType;
  /** True when this is an organisation/contract rather than an individual. */
  isOrganisation: boolean;
  confidence: Confidence;
  /** Human-readable justification shown in the UI. */
  reason: string;
}

export interface ClassifyInput {
  address: string;
  /** Owner wallet, when the row is a token account. */
  owner?: string | null;
  /** Project-specific roles, from MetaDAO's own allocation data. */
  treasuryAddress?: string | null;
  launchAddress?: string | null;
  poolAddress?: string | null;
  /** How many distinct MetaDAO projects list this wallet as a top holder. */
  projectCount?: number;
  /** Owner program of the account, when known (jsonParsed getAccountInfo). */
  ownerProgram?: string | null;
  /** Share of supply held, 0-100. */
  pct?: number | null;
}

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

export function classifyWallet(input: ClassifyInput): OrgVerdict | null {
  const { address, owner } = input;
  const candidates = [owner, address].filter(Boolean) as string[];

  // 1. project-specific on-chain roles
  for (const a of candidates) {
    if (input.treasuryAddress && a === input.treasuryAddress) {
      return {
        label: "DAO Treasury", type: "Treasury", isOrganisation: true,
        confidence: "confirmed",
        reason: "This is the project's DAO treasury vault, per MetaDAO's own allocation data.",
      };
    }
    if (input.launchAddress && a === input.launchAddress) {
      return {
        label: "Launch Vault", type: "Protocol", isOrganisation: true,
        confidence: "confirmed",
        reason: "This is the launchpad's on-chain sale account for this project.",
      };
    }
    if (input.poolAddress && a === input.poolAddress) {
      return {
        label: "Liquidity Pool", type: "Liquidity Pool", isOrganisation: true,
        confidence: "confirmed",
        reason: "This is the AMM pool holding the token's tradeable liquidity, not an investor.",
      };
    }
  }

  // 2. documented third-party address
  for (const a of candidates) {
    const known = KNOWN_WALLETS[a];
    if (known) {
      return {
        ...known, isOrganisation: true, confidence: "confirmed",
        reason: `${known.label} is a documented ${known.type.toLowerCase()} address.`,
      };
    }
  }

  // 3. same wallet is a large holder across multiple projects
  if ((input.projectCount ?? 0) >= 4) {
    return {
      label: "Institution", type: "Smart Money", isOrganisation: true,
      confidence: "likely",
      reason: `Appears among the top holders of ${input.projectCount} separate MetaDAO projects — a pattern typical of a fund or desk rather than an individual.`,
    };
  }

  // 4. program-owned account = a contract
  if (
    input.ownerProgram &&
    input.ownerProgram !== SYSTEM_PROGRAM &&
    !TOKEN_PROGRAMS.has(input.ownerProgram)
  ) {
    return {
      label: "Contract", type: "Protocol", isOrganisation: true,
      confidence: "likely",
      reason: `Held by program ${input.ownerProgram.slice(0, 6)}…, so this is a contract-controlled account (vault, escrow or pool) rather than a personal wallet.`,
    };
  }

  // 5. very large single holder, no other evidence
  if ((input.pct ?? 0) >= 15) {
    return {
      label: "Unidentified Whale", type: "Smart Money", isOrganisation: false,
      confidence: "inferred",
      reason: `Holds ${input.pct!.toFixed(1)}% of supply. Size alone does not prove an organisation — no corroborating on-chain role or registry match was found.`,
    };
  }

  return null;
}

/** Multi-project wallets, computed from the indexed holder table. */
export function crossProjectCounts(
  rows: { owner: string | null; address: string }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.owner ?? r.address;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function confidenceColor(c: Confidence): string {
  return c === "confirmed" ? "var(--good)" : c === "likely" ? "var(--warn)" : "var(--ink-muted)";
}
