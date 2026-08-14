const META_MINT = "METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta";

const API_URL = process.env.METADAO_API_URL || "https://api.metadao.fi";

async function getJSON(url: string) {
  const response = await fetch(url);

  console.log("GET", url);
  console.log("STATUS", response.status);

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log("======================================");
  console.log("META GOVERNANCE TEST");
  console.log("======================================");
  console.log("META:", META_MINT);
  console.log("API:", API_URL);

  /**
   * Try the documented/public API paths.
   *
   * We are intentionally testing the endpoint first rather than
   * hard-coding a response structure that may have changed.
   */
  const endpoints = [
    `${API_URL}/api/daos`,
    `${API_URL}/api/proposals`,
    `${API_URL}/api/dao/${META_MINT}`,
    `${API_URL}/api/proposals/${META_MINT}`,
  ];

  for (const endpoint of endpoints) {
    console.log("\n--------------------------------------");

    try {
      const data = await getJSON(endpoint);

      console.log("RESPONSE:");
      console.dir(data, {
        depth: 8,
      });
    } catch (error) {
      console.error("FAILED:", error instanceof Error ? error.message : error);
    }
  }

  console.log("\n======================================");
  console.log("DONE");
  console.log("======================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
