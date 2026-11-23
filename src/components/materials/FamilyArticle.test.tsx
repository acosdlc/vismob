import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { Family } from "@/lib/configurator/types";
import { FamilyArticle } from "./FamilyArticle";

const FAMILY = SEED_CATALOG.families[0];

// The panel accepts two specification rows with the same name, so a name cannot identify a row.
const withSpecs = (specs: NonNullable<Family["specs"]>): Family => ({ ...FAMILY, specs });

/** The rows on screen, as „name: value”, in order. */
function rows(): string[] {
  const article = screen.getByRole("article", { name: FAMILY.name });
  const names = [...article.querySelectorAll("dt")].map((dt) => dt.textContent);
  const values = [...article.querySelectorAll("dd")].map((dd) => dd.textContent);
  return names.map((name, i) => `${name}: ${values[i]}`);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FamilyArticle", () => {
  it("keeps the line breaks of a description typed on several lines", () => {
    const description = "Țesătură deasă, cu fir scurt.\nSe curăță ușor.";
    render(<FamilyArticle family={{ ...FAMILY, description }} items={[]} />);
    const paragraph = screen.getByRole("article", { name: FAMILY.name }).querySelector("p");
    // The text is printed as stored; pre-line is what makes the browser break the lines.
    expect(paragraph?.textContent).toBe(description);
    expect(paragraph?.className).toContain("whitespace-pre-line");
  });

  it("prints every stored specification row, six included, in the stored order", () => {
    const six = [
      { k: "Compoziție", v: "100% poliester" },
      { k: "Frecare", v: "100.000 cicluri Martindale" },
      { k: "Întreținere", v: "aspirare, lavetă umedă" },
      { k: "Animale", v: "potrivit" },
      { k: "Greutate", v: "380 g/m²" },
      { k: "Lățime", v: "140 cm" },
    ];
    render(<FamilyArticle family={withSpecs(six)} items={[]} />);
    // The panel's hint says so: „Pagina Materiale arată toate rândurile completate, în ordinea de aici.”
    expect(rows()).toEqual(six.map((row) => `${row.k}: ${row.v}`));
  });

  it("prints two specification rows that share a name, and React reports no duplicate key", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <FamilyArticle
        family={withSpecs([
          { k: "Compoziție", v: "100% poliester" },
          { k: "Întreținere", v: "aspirare" },
          { k: "Întreținere", v: "lavetă umedă" },
        ])}
        items={[]}
      />,
    );
    expect(rows()).toEqual(["Compoziție: 100% poliester", "Întreținere: aspirare", "Întreținere: lavetă umedă"]);
    expect(errors).not.toHaveBeenCalled();
  });

  it("follows the rows when one of two same-named rows goes away while the page stays open", () => {
    const view = render(
      <FamilyArticle
        family={withSpecs([
          { k: "Întreținere", v: "aspirare" },
          { k: "Compoziție", v: "100% poliester" },
          { k: "Întreținere", v: "lavetă umedă" },
          { k: "Animale", v: "potrivit" },
        ])}
        items={[]}
      />,
    );
    view.rerender(
      <FamilyArticle
        family={withSpecs([
          { k: "Compoziție", v: "100% poliester" },
          { k: "Întreținere", v: "lavetă umedă" },
          { k: "Animale", v: "potrivit" },
        ])}
        items={[]}
      />,
    );
    expect(rows()).toEqual(["Compoziție: 100% poliester", "Întreținere: lavetă umedă", "Animale: potrivit"]);
  });
});
