import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { capitalise, samplesDeliveryNote } from "./delivery-note";
import { colorIds, resolveSampleItems, sampleItems } from "./samples";

describe("sampleItems / colorIds", () => {
  it("lists every colour of every family, in catalogue order, with its family", () => {
    const items = sampleItems(SEED_CATALOG);
    const expected = SEED_CATALOG.families.flatMap((f) => f.colors.map((c) => c.id));
    expect(items.map((i) => i.id)).toEqual(expected);
    expect(colorIds(SEED_CATALOG)).toEqual(expected);
    expect(new Set(expected).size).toBe(expected.length);

    const verde = items.find((i) => i.id === "ct-verde");
    expect(verde).toMatchObject({ name: "Verde sticlă", code: "CT01", familyId: "catifea", familyName: "Catifea" });
  });

  it("resolves stored ids in their order and reports the unknown ones", () => {
    const { items, unknown } = resolveSampleItems(SEED_CATALOG, ["lm-nuc", "nope", "ct-verde"]);
    expect(items.map((i) => i.id)).toEqual(["lm-nuc", "ct-verde"]);
    expect(unknown).toEqual(["nope"]);
    expect(resolveSampleItems(SEED_CATALOG, [])).toEqual({ items: [], unknown: [] });
  });
});

describe("samplesDeliveryNote", () => {
  it("capitalises the first letter of the cost, skipping a placeholder's bracket", () => {
    expect(capitalise("[gratuit]")).toBe("[Gratuit]");
    expect(capitalise("gratuit")).toBe("Gratuit");
    expect(capitalise("20 lei")).toBe("20 Lei");
    expect(capitalise("")).toBe("");
    expect(samplesDeliveryNote("[2–3 zile lucrătoare]", "[gratuit]")).toBe(
      "Livrare prin curier în [2–3 zile lucrătoare]. [Gratuit].",
    );
    expect(samplesDeliveryNote("2 zile", "contra cost, 20 lei")).toBe("Livrare prin curier în 2 zile. Contra cost, 20 lei.");
  });
});
