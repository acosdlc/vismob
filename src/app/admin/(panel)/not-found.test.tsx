import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ADMIN_MESSAGES, ADMIN_NAV } from "@/lib/admin/types";
import PanelNotFound from "./not-found";

// Every [id] screen of the panel calls notFound() when its record is not there: a request,
// a project, a review or a colour deleted meanwhile, or a wrong id in the address. Next.js
// then renders the nearest not-found file above the page, in place of that folder's layout
// children. With none under (panel) that is src/app/not-found.tsx: the public site's 404,
// with the public header and footer and no way back into the panel.

const PANEL = join(process.cwd(), "src/app/admin/(panel)");

/** The screens of the panel that call notFound(), as paths under (panel). */
const pages = readdirSync(PANEL, { recursive: true, encoding: "utf8" })
  .filter((file) => /(^|\/)page\.tsx$/.test(file))
  .filter((file) => /\bnotFound\(\)/.test(readFileSync(join(PANEL, file), "utf8")))
  .sort();

/** Whether a not-found.tsx stands between the page's folder and (panel), both included. */
function hasPanelNotFound(page: string): boolean {
  for (let dir = dirname(page); ; dir = dirname(dir)) {
    if (existsSync(join(PANEL, dir, "not-found.tsx"))) return true;
    if (dir === ".") return false;
  }
}

describe("a record that is not there, under /admin", () => {
  it("finds the screens it is meant to read", () => {
    expect(pages).toEqual(
      expect.arrayContaining([
        "catalog/baze/[id]/page.tsx",
        "catalog/familii/[id]/page.tsx",
        "catalog/materiale/[id]/page.tsx",
        "catalog/modele/[id]/page.tsx",
        "cereri/[id]/page.tsx",
        "lucrari/[id]/page.tsx",
        "recenzii/[id]/page.tsx",
      ]),
    );
  });

  it.each(pages)("%s gets a not-found screen of the panel, not the public site's 404", (page) => {
    expect(hasPanelNotFound(page)).toBe(true);
  });
});

describe("the admin panel's not-found screen", () => {
  it("says in Romanian that the record is not there, in the letterforms of an admin screen", () => {
    render(<PanelNotFound />);

    const heading = screen.getByRole("heading", { level: 1, name: "Pagina nu există." });
    expect(heading.className).toContain("h2-request");
    // The sentence the actions already answer with when a record is gone.
    expect(ADMIN_MESSAGES.notFound).toBe("Nu am găsit înregistrarea.");
    expect(screen.getByText(ADMIN_MESSAGES.notFound).tagName).toBe("P");
  });

  it("leads back into the panel: one link, to its first screen, under the name the menu gives it", () => {
    render(<PanelNotFound />);

    // One way out on the screen itself; the menu of the panel is the layout's.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/admin");
    expect(links[0]).toHaveTextContent("Panou");
    expect(links[0].className).toContain("bg-accent");
    expect(ADMIN_NAV.find((link) => link.href === "/admin")?.label).toBe("Panou");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders inside the panel's layout: no document, header, main or footer of its own, and nothing of the public site", () => {
    const { container } = render(<PanelNotFound />);

    expect(container.querySelector("html, body, header, main, nav, footer")).toBeNull();
    expect(container.querySelector('a[href="/"], a[href="/configurator"]')).toBeNull();
    expect(container).not.toHaveTextContent("Linkul e greșit sau pagina a fost mutată.");
  });
});
