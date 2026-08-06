"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Left icon rail, per the Own Tomorrow design: 92px wide, sticky, thin
 * geometric marks with labels underneath. Routes that don't exist yet are
 * omitted rather than rendered as dead links.
 */
const ITEMS = [
  { icon: "⌂", label: "Home", href: "/" },
  { icon: "◎", label: "Screener", href: "/screener" },
  { icon: "↯", label: "Activity", href: "/timeline" },
  { icon: "◈", label: "Signals", href: "/observations" },
  { icon: "◇", label: "Portfolio", href: "/portfolio" },
];

export function SideRail() {
  const path = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="sticky top-(--nav-h) hidden h-[calc(100vh-var(--nav-h))] w-[92px] shrink-0 flex-col items-center gap-1.5 border-r border-line py-5 md:flex"
    >
      {ITEMS.map((it) => {
        const on = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className="flex w-16 flex-col items-center gap-1.5 rounded-xl py-2.5 text-[10.5px] font-semibold transition-colors"
            style={{
              background: on ? "var(--accent-dim)" : "transparent",
              color: on ? "var(--accent-hi)" : "var(--ink-muted)",
            }}
          >
            <span className="text-[17px] leading-none">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
