import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { configFromParams } from "@/lib/configurator/url";
import { MaterialsBrowser, materialsTabs } from "./MaterialsBrowser";
import type { MaterialsSettings } from "./types";

const settings: MaterialsSettings = {
  leg_height_cm: "[12]",
  oil_refresh_interval: "[o dată pe an]",
};

const paramsOf = (href: string) => configFromParams(new URLSearchParams(href.slice(href.indexOf("?") + 1)));

describe("MaterialsBrowser", () => {
  it("shows the three tabs with counters from the catalogue, Textile selected by default", () => {
    render(<MaterialsBrowser catalog={SEED_CATALOG} settings={settings} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Textile4 familii", "Lemn masiv5 esențe", "Picioare și baze3"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0].id);
    expect(tabs[0]).toHaveAttribute("aria-controls", panel.id);
    // The swatch panels hold links, so they stay out of the tab order (APG tabs pattern).
    expect(panel).not.toHaveAttribute("tabindex");

    const headings = within(panel).getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["Catifea", "Bouclé", "Stofă", "Piele ecologică"]);
    expect(within(panel).getByText("Moale, cu un luciu discret. Culorile arată intens și se schimbă ușor după cum cade lumina.")).toBeInTheDocument();
    expect(within(panel).getAllByText("[___] cicluri Martindale", { selector: "dd" })).toHaveLength(2);
    // Every textile colour is a tile, and no tile is a button any more.
    expect(within(panel).getAllByRole("link")).toHaveLength(19);
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
  });

  it("links every swatch to the configurator with its family and colour preselected", () => {
    render(<MaterialsBrowser catalog={SEED_CATALOG} settings={settings} />);
    const verde = screen.getByRole("link", { name: /Verde sticlă/ });
    expect(paramsOf(verde.getAttribute("href") ?? "")).toMatchObject({ model: "capitonat", family: "catifea", color: "ct-verde" });

    fireEvent.click(screen.getByRole("tab", { name: /Lemn masiv/ }));
    const nuc = screen.getByRole("link", { name: /^Nuc/ });
    expect(paramsOf(nuc.getAttribute("href") ?? "")).toMatchObject({ model: "lamele", family: "lemn", color: "lm-nuc" });
  });

  it("switches tabs by click and by arrow keys, showing the right panels", () => {
    render(<MaterialsBrowser catalog={SEED_CATALOG} settings={settings} />);
    fireEvent.click(screen.getByRole("tab", { name: /Lemn masiv/ }));
    let panel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: /Lemn masiv/ })).toHaveAttribute("aria-selected", "true");
    expect(within(panel).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Lemn masiv",
      "Finisaje pentru lemn",
    ]);
    expect(within(panel).getAllByRole("link")).toHaveLength(5);
    expect(within(panel).getByText("Mat, se simte lemnul la atingere. Se reîmprospătează [o dată pe an].")).toBeInTheDocument();
    expect(within(panel).getByText("Pentru nuanțe închise pe stejar sau frasin.")).toBeInTheDocument();
    expect(within(panel).getByText("stejar, nuc, frasin", { selector: "dd" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    panel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: /Picioare și baze/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Picioare și baze/ })).toHaveFocus();
    expect(within(panel).queryAllByRole("link")).toHaveLength(0);
    expect(panel).toHaveAttribute("tabindex", "0");
    expect(within(panel).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Picioare din lemn",
      "Picioare metalice",
      "Bază până la podea",
    ]);
    expect(within(panel).getByText("Stejar masiv, înălțime [12] cm, finisaj ca tăblia.")).toBeInTheDocument();
    expect(within(panel).getByText("Oțel vopsit negru mat, înălțime [12] cm.")).toBeInTheDocument();
    expect(within(panel).getByText("Pentru ladă de depozitare sau sertare, cu plintă retrasă.")).toBeInTheDocument();
    expect(within(panel).getAllByText("FOTO")).toHaveLength(3);
    expect(within(panel).getByText("Picior din stejar")).toBeInTheDocument();

    // Right wraps around to the first tab; Left goes back to the last.
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Textile/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /Picioare și baze/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(screen.getByRole("tab", { name: /Textile/ })).toHaveAttribute("aria-selected", "true");
  });

  it("gives every family the §4.3 description and four spec rows", () => {
    for (const family of SEED_CATALOG.families) {
      expect(family.description, family.id).toBeTruthy();
      expect(family.specs, family.id).toHaveLength(4);
    }
    const byId = Object.fromEntries(SEED_CATALOG.families.map((f) => [f.id, f]));
    expect(byId.catifea.specs?.map((s) => s.k)).toEqual(["Compoziție", "Frecare", "Întreținere", "Animale"]);
    expect(byId.piele.specs?.[1]).toEqual({ k: "Grosime", v: "[___] mm" });
    expect(byId.lemn.specs?.[0]).toEqual({ k: "Esențe", v: "stejar, nuc, frasin" });
    expect(byId.lemn.description).toBe("Pentru modelul Lamele și pentru picioare. Lemn [uscat în cuptor], tăiat și finisat în atelier.");
    expect(byId.boucle.specs?.[3].v).toBe("[nerecomandat: se agață ghearele]");
  });

  it("counts the tabs from the catalogue, with singular forms", () => {
    expect(materialsTabs(SEED_CATALOG).map((t) => t.count)).toEqual(["4 familii", "5 esențe", "3"]);
    const smaller = { ...SEED_CATALOG, families: SEED_CATALOG.families.filter((f) => f.id === "catifea" || f.id === "lemn") };
    expect(materialsTabs(smaller)[0].count).toBe("1 familie");
  });
});
