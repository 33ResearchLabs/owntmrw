import { db, allProjects } from "../src/lib/db";
import { fetchMarketHistory } from "../src/lib/sources/marketdata";

(async () => {
  const d = db();
  const history = await fetchMarketHistory("2024-01-01");
  if (!history.size) { console.log("market-data unavailable"); return; }
  const ins = d.prepare("INSERT OR IGNORE INTO candles (project_id, ts, o,h,l,c,v) VALUES (?,?,?,?,?,?,?)");
  for (const p of allProjects()) {
    if (!p.mint) continue;
    const pts = history.get(p.mint);
    if (!pts?.length) continue;
    let added = 0;
    const tx = d.transaction(() => {
      for (const pt of pts) {
        const r = ins.run(p.id, pt.ts, pt.price, pt.price, pt.price, pt.price, pt.volume);
        added += r.changes;
      }
    });
    tx();
    const span = d.prepare("SELECT COUNT(*) n, MIN(ts) lo FROM candles WHERE project_id = ?").get(p.id) as { n: number; lo: number };
    console.log(`${p.name}: +${added} gap days -> ${span.n} total from ${new Date(span.lo * 1000).toISOString().slice(0, 10)}`);
  }
})();
