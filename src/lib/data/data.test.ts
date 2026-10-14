// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { getCatalog } from "./catalog";
import { getHeroProject, getProjects, projectCaption } from "./projects";
import { SEED_PROJECTS } from "./projects.seed";
import { getReviews } from "./reviews";

describe("getCatalog", () => {
  it("returns the seed with the eight featured swatches of Acasă 03, in order", async () => {
    const cat = await getCatalog();
    expect(cat).toBe(SEED_CATALOG);
    const featured = cat.families.flatMap((f) => f.colors.filter((c) => c.featured).map((c) => c.name));
    expect(featured).toEqual([
      "Verde sticlă",
      "Muștar",
      "Alb lapte",
      "Nisip",
      "Gri melanj",
      "Coniac",
      "Stejar natur",
      "Nuc",
    ]);
    expect(cat.families.map((f) => f.tab)).toEqual(["textile", "textile", "textile", "textile", "lemn"]);
  });

  it("uses stable, unique colour codes", async () => {
    const codes = (await getCatalog()).families.flatMap((f) => f.colors.map((c) => c.code));
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("projects", () => {
  it("has one hero with FOTO 01 and the §3.6 placeholders", async () => {
    const hero = await getHeroProject();
    expect(hero).not.toBeNull();
    expect(SEED_PROJECTS.filter((p) => p.hero)).toHaveLength(1);
    expect(hero).toMatchObject({
      ticketNo: "[___]",
      widthCm: 180,
      lengthCm: 200,
      materialLabel: "[material, culoare]",
      deliveredLabel: "[Oraș, lună an]",
      featured: false,
      photo: { label: "FOTO 01" },
    });
    expect(hero?.photo?.frame).toMatch(/^Pat finalizat/);
  });

  it("has six featured tiles, FOTO 02–07, with the §3.4 captions", async () => {
    const featured = await getProjects({ featured: true });
    expect(featured.map((p) => p.photo?.label)).toEqual(["FOTO 02", "FOTO 03", "FOTO 04", "FOTO 05", "FOTO 06", "FOTO 07"]);
    expect(featured.map((p) => p.modelId)).toEqual(["capitonat", "arcuit", "canale", "lamele", "capitonat", "arcuit"]);
    expect(featured[0].title).toBe("Capitonat · 160 × 200 · [material, culoare] · [oraș]");
    for (const p of featured) {
      expect(p.title).toBe(projectCaption(p));
      expect(p.hero).toBe(false);
    }
  });

  it("filters by model", async () => {
    const arcuit = await getProjects({ model: "arcuit" });
    expect(arcuit.map((p) => p.slug)).toEqual(["foto-03", "foto-07"]);
    expect(await getProjects({ model: "lamele", featured: false })).toEqual([]);
    expect(await getProjects()).toHaveLength(7);
  });

  it("uses unique slugs", () => {
    const slugs = SEED_PROJECTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("getReviews", () => {
  it("returns three placeholder cards from the §3.14 template", async () => {
    const reviews = await getReviews();
    expect(reviews).toHaveLength(3);
    for (const r of reviews) {
      expect(r).toEqual({ name: "[Prenume]", city: "[Oraș]", body: "[Recenzie]", modelLabel: "[Model · dimensiune]" });
    }
  });
});
