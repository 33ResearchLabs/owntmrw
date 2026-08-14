import { Connection, PublicKey } from "@solana/web3.js";
import { allProjects } from "../src/lib/db";

const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const REALMS_PROGRAM_ID = "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";

const SQUADS_V4_PROGRAM_ID = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

const METADAO_FUTARCHY_PROGRAM_ID =
  "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq";

type GovernanceResult = {
  name: string;
  symbol: string | null;
  mint: string | null;
  type: string;
  protocol: string | null;
  evidence: string;
};

function safePubkey(value: string | null): PublicKey | null {
  if (!value) return null;

  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

async function getProgramAccounts(connection: Connection, programId: string) {
  try {
    return await connection.getProgramAccounts(new PublicKey(programId), {
      encoding: "base64",
    });
  } catch (error) {
    console.error(
      `Failed to scan ${programId}:`,
      error instanceof Error ? error.message : error,
    );

    return [];
  }
}

function containsPubkey(accountData: Buffer, pubkey: PublicKey): boolean {
  const target = pubkey.toBytes();

  for (let i = 0; i <= accountData.length - 32; i++) {
    let match = true;

    for (let j = 0; j < 32; j++) {
      if (accountData[i + j] !== target[j]) {
        match = false;
        break;
      }
    }

    if (match) return true;
  }

  return false;
}

async function main() {
  console.log("==========================================");
  console.log("ALL TOKEN GOVERNANCE SCANNER");
  console.log("==========================================");
  console.log("RPC:", RPC_URL);

  const connection = new Connection(RPC_URL, "confirmed");

  const projects = allProjects();

  console.log(`Projects: ${projects.length}`);

  console.log("\nScanning Realms...");
  const realmsAccounts = await getProgramAccounts(
    connection,
    REALMS_PROGRAM_ID,
  );

  console.log(`Realms accounts: ${realmsAccounts.length}`);

  console.log("\nScanning Squads...");
  const squadsAccounts = await getProgramAccounts(
    connection,
    SQUADS_V4_PROGRAM_ID,
  );

  console.log(`Squads accounts: ${squadsAccounts.length}`);

  console.log("\nScanning MetaDAO Futarchy...");
  const futarchyAccounts = await getProgramAccounts(
    connection,
    METADAO_FUTARCHY_PROGRAM_ID,
  );

  console.log(`Futarchy accounts: ${futarchyAccounts.length}`);

  const results: GovernanceResult[] = [];

  for (const project of projects) {
    const result: GovernanceResult = {
      name: project.name,
      symbol: project.symbol,
      mint: project.mint,
      type: "unknown",
      protocol: null,
      evidence: "",
    };

    if (!project.mint) {
      result.type = "unknown";
      result.evidence = "No mint address";

      results.push(result);
      continue;
    }

    const mint = safePubkey(project.mint);

    if (!mint) {
      result.type = "unknown";
      result.evidence = "Invalid mint address";

      results.push(result);
      continue;
    }

    /**
     * --------------------------------------------------------
     * META DAO
     * --------------------------------------------------------
     *
     * For your current database, MetaDAO-specific structural
     * fields are useful evidence.
     */
    const metaDAOEvidence =
      !!project.dao_address ||
      !!project.amm_vault_address ||
      !!project.lp_pool_address ||
      !!project.launch_address;

    if (metaDAOEvidence) {
      result.type = "dao";
      result.protocol = "MetaDAO";
      result.evidence = "MetaDAO structural fields detected";

      results.push(result);
      continue;
    }

    /**
     * --------------------------------------------------------
     * REALMS
     * --------------------------------------------------------
     */
    let realmsMatch = false;

    for (const account of realmsAccounts) {
      const raw = account.account.data;

      if (!Array.isArray(raw)) continue;

      try {
        const bytes = Buffer.from(raw[0], "base64");

        if (containsPubkey(bytes, mint)) {
          realmsMatch = true;

          result.type = "dao";
          result.protocol = "Realms / SPL Governance";
          result.evidence = `Mint found in governance account ${account.pubkey}`;

          break;
        }
      } catch {
        // Ignore malformed account
      }
    }

    if (realmsMatch) {
      results.push(result);
      continue;
    }

    /**
     * --------------------------------------------------------
     * SQUADS
     * --------------------------------------------------------
     *
     * This is only a preliminary signal.
     * A token's treasury/program authority can be controlled
     * by Squads without the mint itself appearing directly in a
     * multisig account.
     */
    let squadsMatch = false;

    const knownAddresses = [
      project.treasury_address,
      project.dao_address,
      project.team_address,
      project.amm_vault_address,
      project.lp_pool_address,
    ]
      .map(safePubkey)
      .filter((v): v is PublicKey => v !== null);

    for (const account of squadsAccounts) {
      const raw = account.account.data;

      if (!Array.isArray(raw)) continue;

      try {
        const bytes = Buffer.from(raw[0], "base64");

        for (const address of knownAddresses) {
          if (containsPubkey(bytes, address)) {
            squadsMatch = true;

            result.type = "multisig";
            result.protocol = "Squads";
            result.evidence = `Project treasury/authority referenced by Squads account ${account.pubkey}`;

            break;
          }
        }

        if (squadsMatch) break;
      } catch {
        // Ignore malformed account
      }
    }

    if (squadsMatch) {
      results.push(result);
      continue;
    }

    /**
     * --------------------------------------------------------
     * FUTARCHY FALLBACK
     * --------------------------------------------------------
     *
     * We don't automatically classify a token as MetaDAO merely
     * because it appears somewhere in the Futarchy program.
     * We only report whether an account contains its mint.
     *
     * This is intentionally conservative.
     */
    let futarchyMatch = false;

    for (const account of futarchyAccounts) {
      const raw = account.account.data;

      if (!Array.isArray(raw)) continue;

      try {
        const bytes = Buffer.from(raw[0], "base64");

        if (containsPubkey(bytes, mint)) {
          futarchyMatch = true;

          result.type = "dao";
          result.protocol = "MetaDAO / Futarchy";
          result.evidence = `Mint found in Futarchy account ${account.pubkey}`;

          break;
        }
      } catch {
        // Ignore malformed account
      }
    }

    if (futarchyMatch) {
      results.push(result);
      continue;
    }

    result.type = "unknown";
    result.protocol = null;
    result.evidence = "No supported governance protocol detected";

    results.push(result);
  }

  console.log("\n==========================================");
  console.log("GOVERNANCE REPORT");
  console.log("==========================================");

  for (const result of results) {
    console.log(
      `${result.symbol ?? "?"} | ${result.name} | ` +
        `${result.type} | ` +
        `${result.protocol ?? "—"} | ` +
        `${result.evidence}`,
    );
  }

  console.log("\n==========================================");
  console.log("SUMMARY");
  console.log("==========================================");

  const summary = new Map<string, number>();

  for (const result of results) {
    summary.set(
      result.protocol ?? "Unknown",
      (summary.get(result.protocol ?? "Unknown") ?? 0) + 1,
    );
  }

  for (const [protocol, count] of summary) {
    console.log(`${protocol}: ${count}`);
  }
}

main().catch((error) => {
  console.error("\nSCAN FAILED");
  console.error(error);
  process.exit(1);
});
