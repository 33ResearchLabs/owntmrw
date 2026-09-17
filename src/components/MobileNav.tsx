"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Mark } from "./ui";
import { isCurrentNav, useVisibleNav, type NavItem } from "./TopNav";

/**
 * The phone navigation. Below `sm` the header hides `TopNav` and, until this
 * existed, offered no way to reach any other page — the logo, the search box
 * and the account button were the whole bar.
 *
 * A button and a sheet, built on the native `<dialog>` for the same reasons
 * the wallet modal is: `showModal()` supplies the focus trap, the Escape
 * handler, the inert page behind it and the backdrop. The sheet hangs off
 * the right edge at full height, which is where a thumb expects a menu it
 * opened from the top-right corner.
 *
 * "Open" is stored as the path the sheet was opened on, so navigating — the
 * only thing a link in here does — closes it by definition, without an
 * effect that would have to watch the route and set state after the fact.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const visible = useVisibleNav(items);
  const ref = useRef<HTMLDialogElement>(null);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === path;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // The page behind a sheet must not scroll under it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = () => setOpenedAt(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedAt(path)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink2 transition-colors hover:bg-white/6 hover:text-ink sm:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <dialog
        ref={ref}
        id="mobile-menu"
        aria-label="Menu"
        onClose={close}
        // A click landing on the dialog itself is a click on the backdrop —
        // the panel below stops its own clicks from reaching here.
        onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(86vw,320px)] max-w-none border-0 bg-transparent p-0 text-ink
                   backdrop:bg-black/60 backdrop:backdrop-blur-[3px]
                   open:[animation:modalIn_140ms_ease-out] motion-reduce:open:[animation:none]"
      >
        <div
          className="flex h-full flex-col border-l border-line bg-surface"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex h-16 items-center justify-between border-b border-line px-5">
            <Link href="/" onClick={close} className="flex items-center gap-2.5" aria-label="tekno.works">
              <Mark size={28} />
              <span className="text-[14px] font-extrabold tracking-[-0.01em]">tekno.works</span>
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] leading-none text-muted transition-colors hover:bg-white/8 hover:text-ink"
            >
              ×
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
            {visible.map((n) => {
              const on = isCurrentNav(n.href, path);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={close}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center justify-between rounded-lg px-3 py-3 text-[15px] transition-colors ${
                    on ? "bg-white/8 font-semibold text-ink" : "font-medium text-ink2 hover:bg-white/6 hover:text-ink"
                  }`}
                >
                  {n.label}
                  {on && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" style={{ boxShadow: "0 0 8px 0 var(--brand)" }} />}
                </Link>
              );
            })}

            <div className="mx-3 my-2 h-px bg-line" aria-hidden />

            {[
              { href: "/faq", label: "FAQ" },
              { href: "/terms", label: "Terms of Use" },
              { href: "/privacy", label: "Privacy Policy" },
            ].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={close}
                aria-current={isCurrentNav(n.href, path) ? "page" : undefined}
                className="block rounded-lg px-3 py-2.5 text-[13.5px] text-muted transition-colors hover:bg-white/6 hover:text-ink"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-line px-5 py-4 text-[11px] leading-relaxed text-faint">
            Research and analytics, not investment advice.
          </div>
        </div>
      </dialog>
    </>
  );
}
