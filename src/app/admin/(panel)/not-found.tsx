import { AdminPage } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { ADMIN_MESSAGES, ADMIN_NAV } from "@/lib/admin/types";

// What an admin screen shows when its record is not there: a request, a project, a review
// or a colour deleted meanwhile, or a wrong id in the address (every [id] page under
// (panel) calls notFound()). Next.js renders it where the page would be, inside
// (panel)/layout.tsx: the admin header and the <main> container stay, so the menu still
// works and only the screen itself is replaced. Without this file the nearest not-found
// is src/app/not-found.tsx: the public site's 404, with the public header and footer and
// no way back into the panel.
//
// No text here is new: the heading is the 404's (DESIGN §4.7), the sentence under it is
// the one the actions answer with when a record is gone, and the button carries the
// menu's own name for the panel's first screen. One file serves every list, so it cannot
// know which one the record came from; the menu above it leads to each.
//
// An address /admin has no screen for at all (a typo in the path) still gets the public
// page: Next.js answers an unmatched URL with the root not-found only. A not-found file
// below the root cannot export metadata either, so the tab keeps the screen's own title.

/** The panel's first screen, as the menu names it. */
const [home] = ADMIN_NAV;

export default function PanelNotFound() {
  return (
    <AdminPage title="Pagina nu există." lead={ADMIN_MESSAGES.notFound}>
      <div className="flex flex-wrap items-center gap-3">
        <Button href={home.href} variant="primary">
          {home.label}
        </Button>
      </div>
    </AdminPage>
  );
}
