import { db } from "../db";

/**
 * The `meta` key/value table, used for the ingest's bookkeeping: when it last
 * ran, how it went, and a lock so two runs never overlap. Values are strings;
 * timestamps are Unix seconds written as decimal text.
 *
 * Keys in use — the script writes the first five at the end of a successful
 * run (so a manual `npm run ingest` stamps too), the scheduler the rest:
 *   last_ingest_ts, last_full_ingest_ts, last_ingest_mode,
 *   last_ingest_duration_s, last_ingest_status ("ok" | "failed:<code>" |
 *   "timeout"), last_ingest_attempt_ts, ingest_lock_until.
 */
export function getMeta(key: string): string | null {
  const row = db().prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string | null }
    | undefined;
  return row?.value ?? null;
}

export function getMetaInt(key: string): number | null {
  const v = getMeta(key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function setMeta(key: string, value: string | number): void {
  db()
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, String(value));
}

/**
 * Take a lease on `key` until `untilTs`, if nobody holds one past `nowTs`.
 * One statement, so two processes racing for it cannot both win: the UPDATE
 * only matches while the stored expiry is in the past, and SQLite serialises
 * writers. A lease that is never released (the holder died) simply expires.
 */
export function tryLock(key: string, untilTs: number, nowTs: number): boolean {
  const d = db();
  d.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, '0')").run(key);
  const r = d
    .prepare("UPDATE meta SET value = ? WHERE key = ? AND CAST(value AS INTEGER) < ?")
    .run(String(untilTs), key, nowTs);
  return r.changes === 1;
}

export function releaseLock(key: string): void {
  setMeta(key, 0);
}
