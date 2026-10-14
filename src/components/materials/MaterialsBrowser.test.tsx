import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { sampleItems } from "@/lib/materials/samples";
import { MaterialsBrowser, materialsTabs } from "./MaterialsBrowser";
import type { MaterialsSettings, SampleBoxApi, SampleBoxProps } from "./types";

// The box builder's modules are mocked: a controllable fake of useSampleBox backed by React
// state (so the tiles re-render on add/remove), and stubs for the aside and the fixed button.

const spies = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  hookArgs: [] as Array<[number, readonly string[]]>,
  initialIds: [] as string[],
}));

vi.mock("@/components/materials/sample-box-store", async () => {
  const { useState } = await import("react");
  return {
    useSampleBox(limit: number, validIds: readonly string[]): SampleBoxApi {
      spies.hookArgs.push([limit, validIds]);
      const [ids, setIds] = useState<string[]>(spies.initialIds);
      const has = (id: string) => ids.includes(id);
      return {
        ids,
        limit,
        isFull: ids.length >= limit,
        hydrated: true,
        has,
        add(id) {
          spies.add(id);
          if (has(id) || ids.length >= limit) return false;
          setIds([...ids, id]);
          return true;
        },
        remove(id) {
          spies.remove(id);
          setIds(ids.filter((x) => x !== id));
        },
        clear() {
          setIds([]);
        },
      };
    },
  };
});

vi.mock("@/components/materials/SampleBox", () => ({
  SampleBox: ({ items, box }: SampleBoxProps) => (
    <aside data-testid="sample-box">
      {box.ids.length} / {box.limit}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.code}
            <button type="button" onClick={() => box.remove(item.id)}>
              Scoate {item.name}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  ),
}));

vi.mock("@/components/materials/SampleBoxButton", () => ({
  SampleBoxButton: ({ count }: { count: number }) => <button type="button">Cutia ({count})</button>,
}));

const settings: MaterialsSettings = {
  sample_limit: 5,
  samples_free: "[gratuit]",
  samples_delivery: "[2–3 zile lucrătoare]",
  leg_height_cm: "[12]",
  oil_refresh_interval: "[o dată pe an]",
};

const tile = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  spies.add.mockClear();
  spies.remove.mockClear();
  spies.hookArgs.length = 0;
  spies.initialIds = [];
});

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

    const headings = within(panel).getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["Catifea", "Bouclé", "Stofă", "Piele ecologică"]);
    expect(within(panel).getByText("Moale, cu un luciu discret. Culorile arată intens și se schimbă ușor după cum cade lumina.")).toBeInTheDocument();
    expect(within(panel).getAllByText("[___] cicluri Martindale", { selector: "dd" })).toHaveLength(2);
    expect(within(panel).getAllByRole("button", { pressed: false })).toHaveLength(19);
  });

  it("passes the limit and every colour id to useSampleBox and renders the box with the fixed button", () => {
    render(<MaterialsBrowser catalog={SEED_CATALOG} settings={settings} />);
    const [limit, ids] = spies.hookArgs[0];
    expect(limit).toBe(5);
    expect(ids).toEqual(sampleItems(SEED_CATALOG).map((i) => i.id));
    expect(ids).toHaveLength(24);
    expect(screen.getByTestId("sample-box")).toHaveTextContent("0 / 5");
    expect(screen.getByRole("button", { name: "Cutia (0)" })).toBeInTheDocument();
    const wrapper = document.getElementById("cutie");
    expect(wrapper).toContainElement(screen.getByTestId("sample-box"));
    expect(wrapper?.className).toContain("nav:sticky");
    expect(wrapper?.className).toContain("flex-[1_1_300px]");
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
    expect(within(panel).getAllByRole("button", { pressed: false })).toHaveLength(5);
    expect(within(panel).getByText("Mat, se simte lemnul la atingere. Se reîmprospătează [o dată pe an].")).toBeInTheDocument();
    expect(within(panel).getByText("Pentru nuanțe închise pe stejar sau frasin.")).toBeInTheDocument();
    expect(within(panel).getByText("stejar, nuc, frasin", { selector: "dd" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    panel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: /Picioare și baze/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Picioare și baze/ })).toHaveFocus();
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
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

  it("adds and removes through the tiles, announcing both, and the box follows", () => {
    render(<MaterialsBrowser catalog={SEED_CATALOG} settings={settings} />);
    const announcer = screen.getByTestId("box-announcer");
    expect(announcer).toHaveAttribute("aria-live", "polite");
    expect(announcer).toHaveTextContent("");
    expect(announcer.className).toContain("sr-only");

    fireEvent.click(tile("Verde sticlă"));
    expect(spies.add).toHaveBeenCalledWith("ct-verde");
    expect(tile("Verde sticlă")).toHaveAttribute("aria-pressed", "true");
    expect(tile("Verde sticlă")).toHaveAccessibleDescription("în cutie · CT01");
    expect(announcer).toHaveTextContent("Verde sticlă adăugată în cutie");
    expect(screen.getByTestId("sample-box")).toHaveTextContent("1 / 5");
    expect(screen.getByTestId("sample-box")).toHaveTextContent("CT01");
    expect(screen.getByRole("button", { name: "Cutia (1)" })).toBeInTheDocument();

    fireEvent.click(tile("Verde sticlă"));
    expect(spies.remove).toHaveBeenCalledWith("ct-verde");
    expect(tile("Verde sticlă")).toHaveAttribute("aria-pressed", "false");
    expect(announcer).toHaveTextContent("Verde sticlă scoasă din cutie");
    expect(screen.getByTestId("sample-box")).toHaveTextContent("0 / 5");
  });

  it("announces a removal made from the box's own button, and the same text twice in a row", () => {
    render(<MaterialsBrowser catalog={SEED_CATALOG} settings={settings} />);
    const announcer = screen.getByTestId("box-announcer");

    fireEvent.click(tile("Verde sticlă"));
    const first = announcer.firstElementChild;
    expect(first).toHaveTextContent("Verde sticlă adăugată în cutie");

    fireEvent.click(within(screen.getByTestId("sample-box")).getByRole("button", { name: "Scoate Verde sticlă" }));
    expect(spies.remove).toHaveBeenCalledWith("ct-verde");
    expect(tile("Verde sticlă")).toHaveAttribute("aria-pressed", "false");
    expect(announcer).toHaveTextContent("Verde sticlă scoasă din cutie");

    // Adding it again repeats the text: the node is replaced, so the live region still fires.
    fireEvent.click(tile("Verde sticlă"));
    expect(announcer).toHaveTextContent("Verde sticlă adăugată în cutie");
    expect(announcer.firstElementChild).not.toBe(first);
  });

  it("marks the other tiles „cutia e plină” once the limit is reached, and frees them on removal", () => {
    spies.initialIds = ["ct-verde", "ct-bleumarin", "ct-mustar", "ct-roz"];
    render(<MaterialsBrowser catalog={SEED_CATALOG} settings={settings} />);
    expect(tile("Antracit")).toHaveAccessibleDescription("+ adaugă mostra");

    fireEvent.click(tile("Antracit"));
    expect(screen.getByTestId("sample-box")).toHaveTextContent("5 / 5");
    expect(tile("Antracit")).toHaveAttribute("aria-pressed", "true");
    const sixth = tile("Cărămiziu");
    expect(sixth).toHaveAttribute("aria-pressed", "false");
    expect(sixth).toHaveAttribute("aria-disabled", "true");
    expect(sixth).toHaveAccessibleDescription("cutia e plină");
    fireEvent.click(sixth);
    expect(spies.add).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("sample-box")).toHaveTextContent("5 / 5");

    // The chosen tiles keep their state and the box lists them in box order.
    expect(within(screen.getByTestId("sample-box")).getAllByRole("listitem").map((li) => li.textContent?.slice(0, 4))).toEqual([
      "CT01",
      "CT02",
      "CT03",
      "CT04",
      "CT05",
    ]);
    fireEvent.click(tile("Verde sticlă"));
    expect(screen.getByTestId("sample-box")).toHaveTextContent("4 / 5");
    expect(tile("Cărămiziu")).not.toHaveAttribute("aria-disabled");
    expect(tile("Cărămiziu")).toHaveAccessibleDescription("+ adaugă mostra");
  });
});

describe("catalogue seed for /materiale", () => {
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

  it("computes the tab counters from the catalogue", () => {
    expect(materialsTabs(SEED_CATALOG).map((t) => t.count)).toEqual(["4 familii", "5 esențe", "3"]);
    const smaller = { ...SEED_CATALOG, families: SEED_CATALOG.families.filter((f) => f.id === "catifea" || f.id === "lemn") };
    expect(materialsTabs(smaller)[0].count).toBe("1 familie");
  });
});
