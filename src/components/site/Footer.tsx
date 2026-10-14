import Link from "next/link";
import type { Settings } from "@/lib/data/settings.seed";
import { getCopyrightYear } from "./copyright-year";
import { telHref } from "./links";

export interface FooterProps {
  settings: Settings;
  /** `compact` (Configurator, Materiale): a single mono row. */
  variant?: "full" | "compact";
}

const PAGES = [
  { label: "Lucrări", href: "/lucrari" },
  { label: "Materiale", href: "/materiale" },
  { label: "Configurator", href: "/configurator" },
  { label: "Contact", href: "/contact" },
];

const LEGAL = [
  { label: "Confidențialitate", href: "/confidentialitate" },
  { label: "Cookies", href: "/cookies" },
  { label: "Termeni", href: "/termeni" },
];

const LINK = "inline-flex min-h-11 items-center hover:underline";

function LegalLinks() {
  return (
    <ul className="flex flex-wrap gap-x-6">
      {LEGAL.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={LINK}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// DESIGN §3.17. `.on-dark` turns the focus rings white on the ink background (§2.6).
export async function Footer({ settings, variant = "full" }: FooterProps) {
  const year = await getCopyrightYear();

  if (variant === "compact") {
    return (
      <footer className="on-dark bg-ink text-on-dark">
        <div className="container-site mono-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <p className="py-3">
            © {year} {settings.workshop_name} · {settings.legal_name} · CUI {settings.cui}
          </p>
          <LegalLinks />
        </div>
      </footer>
    );
  }

  const contact: { label: string; href: string }[] = [
    { label: settings.phone_public, href: telHref(settings.phone_public) },
    { label: settings.email_public, href: `mailto:${settings.email_public}` },
  ];
  if (settings.instagram_url) contact.push({ label: "Instagram", href: settings.instagram_url });
  if (settings.facebook_url) contact.push({ label: "Facebook", href: settings.facebook_url });

  return (
    <footer className="on-dark bg-ink text-on-dark">
      <div className="container-site pt-[clamp(48px,6vw,80px)] pb-4">
        <div className="flex flex-wrap gap-9">
          <div className="flex flex-[1_1_280px] flex-col gap-3">
            <p className="logo text-[24px]">{settings.workshop_name}</p>
            <p className="max-w-[380px] text-[15px] text-on-dark-2">
              Paturi construite la comandă, în atelierul din {settings.city}.
            </p>
          </div>
          <nav aria-labelledby="footer-pagini" className="flex-[1_1_160px]">
            <h2 id="footer-pagini" className="eyebrow text-on-dark-3">
              Pagini
            </h2>
            <ul className="mt-2 text-[15px]">
              {PAGES.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex-[1_1_220px]">
            <h2 id="footer-contact" className="eyebrow text-on-dark-3">
              Contact
            </h2>
            <ul aria-labelledby="footer-contact" className="mt-2 text-[15px]">
              {contact.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={LINK}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mono-12 mt-[clamp(40px,5vw,64px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-dark-rule pt-4 text-on-dark-2">
          <p className="py-3">
            © {year} {settings.legal_name} · CUI {settings.cui} · {settings.reg_com} · {settings.registered_office}
          </p>
          <LegalLinks />
        </div>
      </div>
    </footer>
  );
}
