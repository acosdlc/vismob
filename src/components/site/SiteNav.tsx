"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { CloseIcon, MenuIcon } from "./Icons";
import { telHref } from "./links";

// DESIGN §3.1: the six links, in order.
export const NAV_LINKS = [
  { label: "Lucrări", href: "/lucrari" },
  { label: "Modele", href: "/#modele" },
  { label: "Materiale", href: "/materiale" },
  { label: "Configurator", href: "/configurator" },
  { label: "Atelierul", href: "/#atelier" },
  { label: "Contact", href: "/contact" },
] as const;

/** A link is the current page when its path matches; section anchors (`/#modele`) never are. */
export function isCurrentPage(pathname: string | null, href: string): boolean {
  if (!pathname || href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SiteNavProps {
  /** `settings.phone_public`, shown as is; the tel: href drops the spaces. */
  phone: string;
  /** The „Cere ofertă” header button; off on the tool pages (Configurator, Materiale). */
  showCta?: boolean;
}

// The only interactive part of the header: current-page detection and the mobile menu
// (§3.1, §7: aria-expanded, aria-controls, Escape closes and returns focus to the button).
export function SiteNav({ phone, showCta = true }: SiteNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const tel = telHref(phone);

  return (
    <>
      {/* ≥ 960px: links, phone, CTA */}
      <div className="hidden items-center gap-[26px] nav:flex">
        <nav aria-label="Principal">
          <ul className="flex flex-wrap items-center gap-x-[26px] gap-y-1">
            {NAV_LINKS.map((link) => {
              const current = isCurrentPage(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={cx(
                      "inline-block py-3 text-[15px] leading-[1.55] hover:underline",
                      current && "font-semibold shadow-[inset_0_-2px_0_#1E4D3B]",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <a href={tel} className="py-3 font-mono text-[14px] leading-[1.4] hover:underline">
          {phone}
        </a>
        {showCta && (
          <Button href="/contact" size="header">
            Cere ofertă
          </Button>
        )}
      </div>

      {/* < 960px: the menu button; the panel opens under the header */}
      <Button
        ref={toggleRef}
        variant="secondary"
        size="header"
        className="nav:hidden"
        aria-expanded={open}
        aria-controls="meniu-mobil"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Închide" : "Meniu"}
        {open ? <CloseIcon className="h-3 w-3 shrink-0" /> : <MenuIcon className="h-3 w-[18px] shrink-0" />}
      </Button>

      {open && (
        <nav
          id="meniu-mobil"
          aria-label="Meniu"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-76px)] overflow-y-auto border-b border-rule bg-paper nav:hidden"
        >
          <div className="container-site pb-5">
            <ul className="list-none">
              {NAV_LINKS.map((link) => {
                const current = isCurrentPage(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={close}
                      aria-current={current ? "page" : undefined}
                      className={cx(
                        "flex min-h-[52px] items-center border-b border-rule text-[18px] leading-[1.3]",
                        current && "font-semibold",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-3 pt-5">
              <Button href="/contact" onClick={close} className="flex-[1_1_140px]">
                Cere ofertă
              </Button>
              <Button href={tel} variant="secondary" className="flex-[1_1_140px]">
                Sună acum
              </Button>
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
