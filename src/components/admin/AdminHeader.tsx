import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/actions/admin/sign-out";
import { Button } from "@/components/site/Button";
import { getAdminSession } from "@/lib/admin/auth";
import { ADMIN_NAV } from "@/lib/admin/types";
import { getSettings } from "@/lib/data/settings";

const LINK = "inline-flex min-h-11 items-center text-[15px] leading-[1.55] hover:underline";

// DESIGN §4.8, after §3.1: sticky, paper, 1px rule below, row min-height 76px; the logo
// with the workshop name over the sub-logo „Admin”, the ADMIN_NAV links plus „Vezi
// site-ul”, and the secondary „Ieși” button at the header size. One row that wraps on
// mobile; no client code and no current-link state. The settings are cached, so the
// header is part of the static shell; only the signed-in email streams in.
export async function AdminHeader() {
  const { workshop_name } = await getSettings();
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <div className="container-site flex min-h-[76px] flex-wrap items-center justify-between gap-x-5 gap-y-1 py-2">
        <Link href="/admin" className="flex flex-col gap-[2px] py-2">
          <span className="logo">{workshop_name}</span>{" "}
          <span className="sub-logo">Admin</span>
        </Link>
        <nav aria-label="Admin">
          <ul className="flex flex-wrap items-center gap-x-[26px] gap-y-1">
            {ADMIN_NAV.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/" className={LINK}>
                Vezi site-ul
              </Link>
            </li>
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Suspense fallback={null}>
            <SignedInAs />
          </Suspense>
          <form action={signOut}>
            <Button type="submit" variant="secondary" size="header">
              Ieși
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

async function SignedInAs() {
  const admin = await getAdminSession();
  if (!admin?.email) return null;
  return <span className="mono-13 text-muted">{admin.email}</span>;
}
