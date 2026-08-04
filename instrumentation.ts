export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const log = (...args: unknown[]) => console.log("[diag]", ...args);

  log("platform", process.platform, process.arch, process.version);

  try {
    const report = process.report?.getReport() as unknown as {
      header?: { glibcVersionRuntime?: string };
    };
    log("glibcVersionRuntime", report?.header?.glibcVersionRuntime);
  } catch (e) {
    log("reportError", String(e));
  }

  try {
    const DatabaseCtor =
      process.platform === "linux"
        ? require(`better-sqlite3/linux-${process.arch}`)
        : require("better-sqlite3");
    log("ctorLoaded");
    const d = new DatabaseCtor(":memory:");
    log("memoryOpened");
    d.exec("CREATE TABLE t(a)");
    log("memoryExecOk");
    d.close();
    log("memoryClosed");
  } catch (e) {
    log("memoryError", String(e), e instanceof Error ? e.stack : undefined);
  }

  try {
    const path = require("path") as typeof import("path");
    const fs = require("fs") as typeof import("fs");
    const DATA_DIR = path.join(process.cwd(), "data");
    const BUNDLED_DB_PATH = path.join(DATA_DIR, "metaintel.db");
    log("bundledExists", fs.existsSync(BUNDLED_DB_PATH));
    const DatabaseCtor =
      process.platform === "linux"
        ? require(`better-sqlite3/linux-${process.arch}`)
        : require("better-sqlite3");
    const d = new DatabaseCtor(BUNDLED_DB_PATH, { readonly: true });
    log("fileOpened");
    const row = d.prepare("SELECT count(*) as c FROM sqlite_master").get();
    log("queryOk", row);
    d.close();
    log("fileClosed");
  } catch (e) {
    log("fileError", String(e), e instanceof Error ? e.stack : undefined);
  }

  log("done");
}
