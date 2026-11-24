"use client"; // Next.js requires it of error files; the owner accepted this exception to CLAUDE.md rule 3.

import { AdminPage } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";

// What an admin screen shows when it fails while loading or rendering, in place of the
// framework's English „This page couldn’t load”. Next.js renders it where the page would
// be, inside (panel)/layout.tsx: the admin header and the <main> container stay, so the
// menu still works and only the screen itself is replaced. An error of the layout (the
// session check) or of /admin/login is outside it and gets src/app/global-error.tsx,
// which carries the same three texts.
//
// A save that fails does not come here: the forms catch the failed call, keep what was
// typed and show their own notice (useGuardedActionState). The delete buttons do; nothing
// typed is at stake there.
//
// `retry` is what Next.js passes to error files: it fetches the screen from the server
// again and renders it in place of this one.
export default function PanelError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <AdminPage title="Ceva nu a mers." lead="Pagina nu s-a putut încărca. Verifică legătura la internet și încearcă din nou.">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => retry()}>
          Încearcă din nou
        </Button>
      </div>
    </AdminPage>
  );
}
