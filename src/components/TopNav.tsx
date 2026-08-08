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

  /*
   * Signed out, the bar carries Home and nothing else: every other route is
   * gated, so the links were four invitations to a dialog. `gated()` is the
   * same predicate the click interception used, and it is kept in step with
   * `proxy.ts` — so the bar cannot come to disagree with what is actually
   * protected, and an ungated route added later appears here without a change.
   *
   * This hides links; it does not protect routes. `proxy.ts` still redirects a
   * typed URL and the pages still call `requireSession`.
   */
  const visible = session ? items : items.filter((n) => !signIn.gated(n.href));

  return (
    <nav className="hidden items-center gap-0.5 sm:flex lg:gap-1.5">
      {visible.map((n) => {
        const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            // No click interception here any more: the only links that reach
            // this point are ones the reader is allowed to follow, so there is
            // nothing left to intercept. The dialog is still opened from the
            // header's connect button and from `SignInContent`.
            className={`relative rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150 lg:px-3.5 ${
              on
                ? "font-semibold text-ink"
                : "font-medium text-ink2 hover:bg-white/6 hover:text-ink"
            }`}
          >
            {n.label}
            {/* The mark is a real element rather than a border so it can carry a
                glow without the glow bleeding onto the link's hover surface.

                The inset runs past the link's own padding — 6px into the label
                on each side — so the mark sits shorter than the word and stays
                centred under it. Insetting rather than fixing a width keeps it
                proportional, so it reads the same under "Home" as "Portfolio". */}
            {on && (
              <span
                aria-hidden
                className="absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-brand lg:inset-x-5"
                style={{ boxShadow: "0 0 9px 0 var(--brand)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
