import Link from "next/link";
import type { Settings } from "@/lib/data/settings.seed";
import { SiteNav } from "./SiteNav";

export interface HeaderProps {
  settings: Settings;
  /** `tool` (Configurator, Materiale) drops the „Cere ofertă” header button: the page has its own CTA. */
  variant?: "full" | "tool";
}

// DESIGN §3.1: sticky, paper, 1px rule below, row min-height 76px with gap 20px; the logo
// is two lines 2px apart. Everything interactive is in SiteNav (client).
export function Header({ settings, variant = "full" }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <div className="container-site flex min-h-[76px] items-center justify-between gap-5">
        <Link href="/" className="flex flex-col gap-[2px] py-2">
          <span className="logo">{settings.workshop_name}</span>{" "}
          <span className="sub-logo">Paturi la comandă</span>
        </Link>
        <SiteNav phone={settings.phone_public} showCta={variant === "full"} />
      </div>
    </header>
  );
}
