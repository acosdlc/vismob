import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/actions/admin/sign-out";
import { LoginForm } from "@/components/admin/LoginForm";
import { AdminCard, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";
import { Eyebrow } from "@/components/site/Eyebrow";
import { formStackClasses } from "@/components/site/form";
import { ADMIN_HOME_PATH, readSession } from "@/lib/admin/auth";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Intră în cont" };

// DESIGN §4.8: the login screen is one centred card (§3.16), max 420px, no header.
// The session read sits behind Suspense (cookies at request time); the card, the
// eyebrow and the title are part of the static shell.
export default async function LoginPage() {
  const { workshop_name } = await getSettings();
  return (
    <main className="container-site flex-1 pb-16">
      <AdminCard className={cx(formStackClasses, "mx-auto mt-[clamp(32px,10vh,120px)] w-full max-w-[420px]")}>
        <div className="flex flex-col gap-2">
          <Eyebrow>{workshop_name} — Admin</Eyebrow>
          <h1 className="h2-request">Intră în cont</h1>
        </div>
        <Suspense fallback={<LoginForm />}>
          <LoginGate />
        </Suspense>
      </AdminCard>
    </main>
  );
}

// An admin goes straight to the panel; a signed-in user without the role learns
// why and can sign out; everyone else gets the form.
async function LoginGate() {
  const session = await readSession();
  if (session.kind === "signed-in" && session.admin) redirect(ADMIN_HOME_PATH);
  if (session.kind === "signed-in") {
    return (
      <div className={formStackClasses}>
        <Notice tone="error">{ADMIN_MESSAGES.notAdmin}</Notice>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Ieși din cont
          </Button>
        </form>
      </div>
    );
  }
  return <LoginForm />;
}
