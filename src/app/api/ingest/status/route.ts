import { NextResponse } from "next/server";
import { ingestStatus } from "@/lib/ingest/scheduler";

export const dynamic = "force-dynamic";

/**
 * When the archive last moved and whether it is moving now. Public: it says
 * how fresh the site's own data is, which every reader is entitled to, and
 * nothing about who asked.
 */
export async function GET() {
  return NextResponse.json(ingestStatus(), { headers: { "cache-control": "no-store" } });
}
