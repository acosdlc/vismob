// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { resolve } from "./rules";
import type { Catalog, Config } from "./types";

const cfg = (patch: Partial<Config>): Config => ({ ...DEFAULT_CONFIG, ...patch });

describe("resolve", () => {
  it("returns the default configuration unchanged", () => {
    const r = resolve(DEFAULT_CONFIG, SEED_CATALOG);
    expect(r.cfg).toEqual(DEFAULT_CONFIG);
    expect(r.model.id).toBe("capitonat");
    expect(r.family.id).toBe("catifea");
    expect(r.color.id).toBe("ct-verde");
    expect(r.base.id).toBe("lemn");
    expect(r.w).toBe(160);
    expect(r.l).toBe(200);
  });

  it("lamele accepts only lemn", () => {
    const r = resolve(cfg({ model: "lamele", family: "catifea", color: "ct-verde" }), SEED_CATALOG);
    expect(r.family.id).toBe("lemn");
    expect(r.color.id).toBe("lm-stejar");
    expect(r.cfg.family).toBe("lemn");
    expect(r.cfg.color).toBe("lm-stejar");

    const kept = resolve(cfg({ model: "lamele", family: "lemn", color: "lm-nuc" }), SEED_CATALOG);
    expect(kept.family.id).toBe("lemn");
    expect(kept.color.id).toBe("lm-nuc");
  });

  it("textile models do not accept lemn", () => {
    for (const model of ["capitonat", "arcuit", "canale"] as const) {
      const r = resolve(cfg({ model, family: "lemn", color: "lm-nuc" }), SEED_CATALOG);
      expect(r.family.id).toBe("catifea");
      expect(r.color.id).toBe("ct-verde");
    }
  });

  it("a model change resets family and colour to the first allowed", () => {
    const wood = resolve(cfg({ model: "lamele", family: "lemn", color: "lm-nuc" }), SEED_CATALOG);
    const r = resolve({ ...wood.cfg, model: "arcuit" }, SEED_CATALOG);
    expect(r.model.id).toBe("arcuit");
    expect(r.family.id).toBe("catifea");
    expect(r.color.id).toBe("ct-verde");
  });

  it("a model change keeps a family the new model also allows", () => {
    const r = resolve(cfg({ model: "canale", family: "boucle", color: "bc-nisip" }), SEED_CATALOG);
    expect(r.family.id).toBe("boucle");
    expect(r.color.id).toBe("bc-nisip");
  });

  it("a family change resets the colour to the first in the family", () => {
    const r = resolve(cfg({ family: "boucle", color: "ct-verde" }), SEED_CATALOG);
    expect(r.family.id).toBe("boucle");
    expect(r.color.id).toBe("bc-alb");
  });

  it("unknown ids fall back", () => {
    const r = resolve(
      cfg({
        model: "xyz" as Config["model"],
        family: "xyz" as Config["family"],
        color: "xyz",
        base: "xyz" as Config["base"],
      }),
      SEED_CATALOG,
    );
    expect(r.model.id).toBe("capitonat");
    expect(r.family.id).toBe("catifea");
    expect(r.color.id).toBe("ct-verde");
    expect(r.base.id).toBe("lemn");
  });

  it("standard sizes give w × 200", () => {
    for (const size of ["90", "120", "140", "160", "180", "200"] as const) {
      const r = resolve(cfg({ size }), SEED_CATALOG);
      expect(r.w).toBe(Number(size));
      expect(r.l).toBe(200);
      expect(r.cfg.size).toBe(size);
    }
  });

  it("custom sizes clamp to 80–220 × 180–220", () => {
    expect(resolve(cfg({ size: "custom", customW: 50, customL: 100 }), SEED_CATALOG)).toMatchObject({ w: 80, l: 180 });
    expect(resolve(cfg({ size: "custom", customW: 300, customL: 400 }), SEED_CATALOG)).toMatchObject({ w: 220, l: 220 });
    expect(resolve(cfg({ size: "custom", customW: 185, customL: 210 }), SEED_CATALOG)).toMatchObject({ w: 185, l: 210 });
  });

  it("custom sizes are rounded and zero or NaN falls back to 150 × 200", () => {
    expect(resolve(cfg({ size: "custom", customW: 150.4, customL: 199.6 }), SEED_CATALOG)).toMatchObject({ w: 150, l: 200 });
    expect(resolve(cfg({ size: "custom", customW: 0, customL: Number.NaN }), SEED_CATALOG)).toMatchObject({ w: 150, l: 200 });
  });

  it("an invalid size key becomes 160", () => {
    const r = resolve(cfg({ size: "170" as Config["size"] }), SEED_CATALOG);
    expect(r.cfg.size).toBe("160");
    expect(r.w).toBe(160);
    expect(r.l).toBe(200);
  });

  it("an invalid headboard height becomes 120", () => {
    const r = resolve(cfg({ hb: 130 as Config["hb"] }), SEED_CATALOG);
    expect(r.cfg.hb).toBe(120);
    expect(resolve(cfg({ hb: 140 }), SEED_CATALOG).cfg.hb).toBe(140);
  });

  it("keeps the extras", () => {
    const r = resolve(cfg({ led: true, nightstands: true }), SEED_CATALOG);
    expect(r.cfg.led).toBe(true);
    expect(r.cfg.nightstands).toBe(true);
  });

  it("throws a clear error on an empty catalog", () => {
    const empty: Catalog = { models: [], families: [], bases: [] };
    expect(() => resolve(DEFAULT_CONFIG, empty)).toThrow(/no models/);
  });

  it("throws a clear error when a model allows a family the catalog lacks", () => {
    const broken: Catalog = { ...SEED_CATALOG, families: SEED_CATALOG.families.filter((f) => f.id !== "lemn") };
    expect(() => resolve(cfg({ model: "lamele" }), broken)).toThrow(/lamele.*lemn/);
  });

  it("throws a clear error when a family has no colours or the catalog has no bases", () => {
    const noColors: Catalog = {
      ...SEED_CATALOG,
      families: SEED_CATALOG.families.map((f) => (f.id === "catifea" ? { ...f, colors: [] } : f)),
    };
    expect(() => resolve(DEFAULT_CONFIG, noColors)).toThrow(/catifea.*no colors/);
    const noBases: Catalog = { ...SEED_CATALOG, bases: [] };
    expect(() => resolve(DEFAULT_CONFIG, noBases)).toThrow(/no bases/);
  });
});
