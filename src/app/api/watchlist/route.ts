import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { sameOrigin } from "@/lib/admin";
import { addWatch, removeWatch, watchlistSlugs } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "cache-control": "no-store" } };

/** The signed-in wallet's watchlist, newest-followed first. */
export async function GET() {
  const session = await currentAddress();
  if (!session) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  return NextResponse.json({ slugs: watchlistSlugs(session) }, NO_STORE);
}

/**
 * Add (POST) or remove (DELETE) one project. Both answer with the whole list
 * so the client reconciles to what the server holds rather than to what it
 * hoped. The address is the session's, never the body's; the origin check
 * keeps a page elsewhere from following projects on a reader's behalf with
 * their cookie.
 */
async function mutate(req: Request, op: typeof addWatch) {
  const session = await currentAddress();
  if (!session) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "cross-origin request refused" }, { status: 403 });
  }
  let slug: unknown;
  try {
    ({ slug } = (await req.json()) as { slug?: unknown });
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  const result = op(session, slug);
  if (result === "unknown") {
    return NextResponse.json({ error: "unknown project" }, { status: 404 });
  }
  return NextResponse.json({ slugs: watchlistSlugs(session), result }, NO_STORE);
}

export async function POST(req: Request) {
  return mutate(req, addWatch);
}

export async function DELETE(req: Request) {
  return mutate(req, removeWatch);
}
