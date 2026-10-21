import { Suspense, type ReactNode } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/lib/admin/auth";

// The guarded shell of every admin screen except /admin/login (DESIGN §4.8: sticky
// header, content in .container-site, no footer). The chrome is static; the session
// check reads cookies, so it runs inside Suspense and every page under it may call
// requireAdmin(), createClient(), params and searchParams at its top level.
export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <AdminHeader />
      <main className="container-site w-full flex-1 py-8 md:py-12">
        <Suspense fallback={<p className="mono-13 text-muted">Se încarcă…</p>}>
          <Guard>{children}</Guard>
        </Suspense>
      </main>
    </>
  );
}

async function Guard({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
