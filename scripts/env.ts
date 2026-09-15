import fs from "node:fs";
import path from "node:path";

/**
 * Next.js loads `.env.local` for the app; a script run through tsx gets
 * nothing, so `npm run ingest` was reading holders and supply from the RPC
 * default rather than the configured endpoint. Imported first, before any
 * module that reads process.env at load time. Variables already set in the
 * shell take precedence over the file, so a one-off override still works.
 */
const file = path.join(process.cwd(), ".env.local");
if (fs.existsSync(file)) process.loadEnvFile(file);
