"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface TabDef {
  key: string;
  label: string;
  /** Rendered on the right of the label, e.g. a count. */
  badge?: string | number;
  content: ReactNode;
}

export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const keys = tabs.map((t) => t.key).join(",");

  // Tabs are deep-linkable (#holders, #research…) so a view can be shared,
  // and the back button moves between sections.
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && keys.split(",").includes(h)) setActive(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [keys]);

  const select = (key: string) => {
    setActive(key);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${key}`);
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Project intelligence sections"
        className="scroll-x-quiet flex gap-0.5 border-b border-grid"
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => select(t.key)}
              className={`relative shrink-0 px-3 py-2 text-[13px] transition-colors ${
                on ? "text-ink" : "text-muted hover:text-ink2"
              }`}
            >
              {t.label}
              {t.badge != null && t.badge !== 0 && (
                <span className="num ml-1.5 rounded bg-surface2 px-1 py-0.5 text-[10px] text-ink2">
                  {t.badge}
                </span>
              )}
              {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-5">{current?.content}</div>
    </div>
  );
}
