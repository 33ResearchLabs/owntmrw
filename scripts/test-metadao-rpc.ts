import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const META_MINT = "METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta";

const FUTARCHY_PROGRAM = "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq";

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("======================================");
  console.log("META GOVERNANCE RPC TEST");
  console.log("======================================");
  console.log("RPC:", RPC_URL);
  console.log("META MINT:", META_MINT);
  console.log("FUTARCHY PROGRAM:", FUTARCHY_PROGRAM);

  const mint = new PublicKey(META_MINT);
  const program = new PublicKey(FUTARCHY_PROGRAM);

  console.log("\nFetching Futarchy program accounts...");

  const accounts = await connection.getProgramAccounts(program, {
    encoding: "base64",
  });

  console.log("Account count:", accounts.length);

  let matches = 0;

  for (const item of accounts) {
    const data = item.account.data;

    if (!Array.isArray(data)) continue;

    const [base64] = data;

    const bytes = Buffer.from(base64, "base64");
    const mintBytes = mint.toBytes();

    let found = false;

    for (let i = 0; i <= bytes.length - 32; i++) {
      let same = true;

      for (let j = 0; j < 32; j++) {
        if (bytes[i + j] !== mintBytes[j]) {
          same = false;
          break;
        }
      }

      if (same) {
        found = true;
        break;
      }
    }

    if (!found) continue;

    matches++;

    console.log("\n======================================");
    console.log("POSSIBLE META GOVERNANCE ACCOUNT");
    console.log("======================================");

    console.log("Address:", item.pubkey.toBase58());
    console.log("Owner:", item.account.owner.toBase58());
    console.log("Lamports:", item.account.lamports);
    console.log("Data size:", bytes.length);
    console.log("Contains META mint: YES");

    console.log("Raw account data (first 100 bytes):");
    console.log(bytes.subarray(0, 100).toString("hex"));
  }

  console.log("\n======================================");
  console.log("RESULT");
  console.log("======================================");
  console.log("Matching accounts:", matches);

  if (matches === 0) {
    console.log("No Futarchy account containing META mint was found.");
  }
}

main().catch((error) => {
  console.error("\nTEST FAILED");
  console.error(error);
  process.exit(1);
});
