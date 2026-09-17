import { db, projectBySlug } from "./db";

/**
 * The signed-in wallet's watchlist, as project slugs.
 *
 * Slugs rather than ids because that is what every consumer already keys on:
 * the feeds carry `slug`, the screener rows carry `slug`, and the button on a
 * project page knows its slug. Newest-followed first, so a rail that shows
 * the first few shows the ones the reader just added.
 */
export function watchlistSlugs(address: string): string[] {
  return (
    db()
      .prepare(
        `SELECT p.slug FROM watchlist w
         JOIN projects p ON p.id = w.project_id
         WHERE w.address = ?
         ORDER BY w.created_ts DESC, w.rowid DESC`,
      )
      .all(address) as { slug: string }[]
  ).map((r) => r.slug);
}

export type WatchResult = "added" | "removed" | "unchanged" | "unknown";

/** Follow a project. Idempotent: a second add is "unchanged", not an error. */
export function addWatch(address: string, slug: string): WatchResult {
  const p = projectBySlug(slug);
  if (!p) return "unknown";
  const r = db()
    .prepare(
      "INSERT OR IGNORE INTO watchlist (address, project_id, created_ts) VALUES (?, ?, ?)",
    )
    .run(address, p.id, Math.floor(Date.now() / 1000));
  return r.changes > 0 ? "added" : "unchanged";
}

/** Unfollow a project. Unknown slugs and rows that were never there are both "unchanged". */
export function removeWatch(address: string, slug: string): WatchResult {
  const p = projectBySlug(slug);
  if (!p) return "unknown";
  const r = db()
    .prepare("DELETE FROM watchlist WHERE address = ? AND project_id = ?")
    .run(address, p.id);
  return r.changes > 0 ? "removed" : "unchanged";
}
