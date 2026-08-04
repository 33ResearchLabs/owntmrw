import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: { root: __dirname },
  // Ship the SQLite snapshot inside the serverless function bundle so the
  // deployed site has real data without a separate database service.
  outputFileTracingIncludes: {
    "/**": ["./data/metaintel.db"],
  },
};

export default nextConfig;
