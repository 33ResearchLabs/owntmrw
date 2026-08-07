"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Top navigation links with an active-route mark.
 *
 * Split out of `layout.tsx` because that file is a server component and the
 * mark needs `usePathname`. The match rule is character-for-character the one
 * `SideRail` uses, so the two navigations cannot disagree about which route is
 * current — they are the same four routes rendered twice.
 */
export function TopNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const { session } = useWallet();
  const signIn = useSignIn();

  return (
    <nav className="hidden items-center gap-0.5 sm:flex lg:gap-1.5">
      {items.map((n) => {
        const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            onClick={(e) => {
              // Signed out and aimed at a gated route: open the dialog instead
              // of letting the navigation happen, get redirected by the proxy
              // and land on the login page. The redirect still exists and is
              // still what protects the route — this just spares the reader a
              // round trip when they are already here.
              if (!session && signIn.gated(n.href)) {
                e.preventDefault();
                signIn.open(n.href);
              }
            }}
            className={`relative rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150 lg:px-3.5 ${
              on
                ? "font-semibold text-ink"
                : "font-medium text-ink2 hover:bg-white/6 hover:text-ink"
            }`}
          >
            {n.label}
            {/* The mark is a real element rather than a border so it can carry a
                glow without the glow bleeding onto the link's hover surface. */}
            {on && (
              <span
                aria-hidden
                className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-accent lg:inset-x-3.5"
                style={{ boxShadow: "0 0 9px 0 var(--accent)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
