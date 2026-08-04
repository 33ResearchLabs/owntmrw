"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit { type: string; label: string; sub: string; href: string }

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) { setHits(await res.json()); setActive(0); setOpen(true); }
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && hits[active]) { setOpen(false); setQ(""); router.push(hits[active].href); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search projects, tokens, wallets, proposals…"
        className="w-full rounded-full border border-line bg-white/5 px-4 py-2 text-[13px] text-ink placeholder:text-faint outline-none transition-colors focus:border-accent/50"
      />
      {open && hits.length > 0 && (
        <div className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          {hits.map((h, i) => (
            <button
              key={h.href + i}
              onMouseEnter={() => setActive(i)}
              onClick={() => { setOpen(false); setQ(""); router.push(h.href); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] ${i === active ? "bg-white/5" : ""}`}
            >
              <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">{h.type}</span>
              <span className="truncate">{h.label}</span>
              <span className="ml-auto truncate text-[12px] text-muted">{h.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
