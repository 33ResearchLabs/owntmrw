import { NextResponse } from "next/server";

export async function GET() {
  const info: Record<string, unknown> = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };

  try {
    const report = process.report?.getReport();
    info.glibcVersionRuntime = (report as unknown as { header?: { glibcVersionRuntime?: string } })
      ?.header?.glibcVersionRuntime;
  } catch (e) {
    info.reportError = String(e);
  }

  try {
    const binding = require("better-sqlite3/lib/binding");
    info.prebuildPath = binding.getPrebuildPath();
  } catch (e) {
    info.bindingError = String(e);
  }

  try {
    const DatabaseCtor =
      process.platform === "linux"
        ? require(`better-sqlite3/linux-${process.arch}`)
        : require("better-sqlite3");
    info.ctorLoaded = true;
    const d = new DatabaseCtor(":memory:");
    info.memoryOpened = true;
    d.exec("CREATE TABLE t(a)");
    info.memoryExecOk = true;
    d.close();
  } catch (e) {
    info.memoryError = String(e);
  }

  return NextResponse.json(info);
}

export async function POST() {
  // Separate route step so a segfault here doesn't take out the GET diagnostics above.
  const path = require("path") as typeof import("path");
  const fs = require("fs") as typeof import("fs");
  const DATA_DIR = path.join(process.cwd(), "data");
  const BUNDLED_DB_PATH = path.join(DATA_DIR, "metaintel.db");
  const info: Record<string, unknown> = { bundledExists: fs.existsSync(BUNDLED_DB_PATH) };
  const DatabaseCtor =
    process.platform === "linux"
      ? require(`better-sqlite3/linux-${process.arch}`)
      : require("better-sqlite3");
  const d = new DatabaseCtor(BUNDLED_DB_PATH, { readonly: true });
  info.fileOpened = true;
  const row = d.prepare("SELECT count(*) as c FROM sqlite_master").get();
  info.queryOk = row;
  d.close();
  return NextResponse.json(info);
}
