import { db, allProjects } from "../src/lib/db";

async function main() {
  const projects = allProjects();

  const meta = projects.find(
    (p) =>
      p.symbol?.toUpperCase() === "META" ||
      p.name.toLowerCase().includes("meta"),
  );

  if (!meta) {
    console.error("META token not found in database.");
    process.exit(1);
  }

  console.log("\n======================================");
  console.log("META GOVERNANCE TEST");
  console.log("======================================");

  console.log("Project:", meta.name);
  console.log("Symbol:", meta.symbol);
  console.log("Mint:", meta.mint);
  console.log("DAO address:", meta.dao_address);
  console.log("Treasury:", meta.treasury_address);
  console.log("Futarchy AMM:", meta.amm_vault_address);
  console.log("LP pool:", meta.lp_pool_address);

  console.log("\n======================================");
  console.log("RESULT");
  console.log("======================================");

  console.log({
    governanceDetected:
      !!meta.dao_address || !!meta.amm_vault_address || !!meta.lp_pool_address,

    governanceType:
      meta.dao_address || meta.amm_vault_address || meta.lp_pool_address
        ? "MetaDAO / Futarchy"
        : "Unknown",

    votingModel:
      meta.dao_address || meta.amm_vault_address || meta.lp_pool_address
        ? "Decision markets"
        : null,

    governanceAddress: meta.dao_address ?? null,

    treasuryAddress: meta.treasury_address ?? null,

    tokenMint: meta.mint ?? null,
  });

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
