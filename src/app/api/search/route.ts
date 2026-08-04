import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);
  return NextResponse.json(searchAll(q));
}
