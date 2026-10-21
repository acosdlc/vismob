import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { configFromParams } from "@/lib/configurator/url";
import { configuratorHref, modelFor, swatchItems } from "./swatches";

describe("swatchItems", () => {
  it("lists every colour of every family, in catalogue order, with its family", () => {
    const items = swatchItems(SEED_CATALOG);
    const expected = SEED_CATALOG.families.flatMap((f) => f.colors.map((c) => c.id));
    expect(items.map((i) => i.id)).toEqual(expected);
    expect(new Set(expected).size).toBe(expected.length);
    expect(items.find((i) => i.id === "ct-verde")).toMatchObject({
      name: "Verde sticlă",
      code: "CT01",
      familyId: "catifea",
      familyName: "Catifea",
      modelId: "capitonat",
    });
    expect(items.find((i) => i.id === "lm-nuc")?.modelId).toBe("lamele");
  });
});

describe("modelFor", () => {
  it("prefers the default model when its rules allow the family, else the first model that does", () => {
    expect(modelFor(SEED_CATALOG, "boucle")).toBe("capitonat");
    expect(modelFor(SEED_CATALOG, "lemn")).toBe("lamele");
    // The workshop removed bouclé from Capitonat: the tile opens Arcuit, not a repaired colour.
    const edited = {
      ...SEED_CATALOG,
      models: SEED_CATALOG.models.map((m) => (m.id === "capitonat" ? { ...m, families: m.families.filter((f) => f !== "boucle") } : m)),
    };
    expect(modelFor(edited, "boucle")).toBe("arcuit");
    // The default model is inactive: the first remaining model that allows the family.
    const noDefault = { ...SEED_CATALOG, models: SEED_CATALOG.models.filter((m) => m.id !== "capitonat") };
    expect(modelFor(noDefault, "catifea")).toBe("arcuit");
    // No model allows the family at all: the default model, for resolve() to repair.
    const orphan = { ...SEED_CATALOG, models: SEED_CATALOG.models.map((m) => ({ ...m, families: m.families.filter((f) => f !== "piele") })) };
    expect(modelFor(orphan, "piele")).toBe("capitonat");
  });
});

describe("configuratorHref", () => {
  it("opens the configurator with the family and colour preselected on the default model", () => {
    const href = configuratorHref({ id: "bc-nisip", familyId: "boucle", modelId: "capitonat" });
    expect(href.startsWith("/configurator?")).toBe(true);
    const cfg = configFromParams(new URLSearchParams(href.slice(href.indexOf("?") + 1)));
    expect(cfg).toMatchObject({ model: "capitonat", family: "boucle", color: "bc-nisip" });
  });

  it("keeps the model the item carries (Lamele for the wood family)", () => {
    const href = configuratorHref({ id: "lm-nuc", familyId: "lemn", modelId: "lamele" });
    const cfg = configFromParams(new URLSearchParams(href.slice(href.indexOf("?") + 1)));
    expect(cfg).toMatchObject({ model: "lamele", family: "lemn", color: "lm-nuc" });
  });
});
