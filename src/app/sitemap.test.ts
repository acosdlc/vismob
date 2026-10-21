// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/data/projects";

const mocks = vi.hoisted(() => ({ getProjects: vi.fn() }));
vi.mock("@/lib/data/projects", () => ({ getProjects: mocks.getProjects }));

import sitemap, { PUBLIC_ROUTES, sitemapEntries } from "./sitemap";

const BASE = "https://www.vismob.dev";
const MEDIA = "https://project.supabase.co/storage/v1/object/public/media";

/** A published project as getProjects() returns it; `src` is the first photo's URL, absent before the photo exists. */
function project(slug: string, src?: string): Project {
  return {
    slug,
    ticketNo: "",
    title: slug,
    modelId: "capitonat",
    widthCm: 160,
    lengthCm: 200,
    materialLabel: "",
    baseLabel: "",
    extras: [],
    city: "",
    deliveredLabel: "",
    photo: { src, alt: undefined, label: "", frame: "" },
    featured: false,
    hero: false,
  };
}

beforeEach(() => {
  mocks.getProjects.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PUBLIC_ROUTES", () => {
  it("lists the eight public routes and none of the panel or the API", () => {
    expect(PUBLIC_ROUTES).toEqual([
      "/",
      "/lucrari",
      "/materiale",
      "/configurator",
      "/contact",
      "/confidentialitate",
      "/cookies",
      "/termeni",
    ]);
  });
});

describe("sitemapEntries", () => {
  it("maps every route onto the origin and writes nothing it cannot know", () => {
    const entries = sitemapEntries(BASE, []);
    expect(entries.map((e) => e.url)).toEqual(PUBLIC_ROUTES.map((path) => `${BASE}${path}`));
    for (const entry of entries) {
      expect(Object.keys(entry)).toEqual(["url"]);
    }
  });

  it("puts the first photo of each published project on /lucrari, skipping projects without one", () => {
    const entries = sitemapEntries(BASE, [
      project("pat-capitonat-cluj", `${MEDIA}/projects/cluj/01.webp`),
      project("fara-poza"),
      { ...project("fara-obiect-photo"), photo: undefined },
      project("pat-arcuit-brasov", `${MEDIA}/projects/brasov/01.webp`),
      project("aceeasi-poza", `${MEDIA}/projects/cluj/01.webp`),
    ]);
    const lucrari = entries.find((e) => e.url === `${BASE}/lucrari`);
    expect(lucrari).toEqual({
      url: `${BASE}/lucrari`,
      images: [`${MEDIA}/projects/cluj/01.webp`, `${MEDIA}/projects/brasov/01.webp`],
    });
    for (const entry of entries) {
      if (entry !== lucrari) expect(Object.keys(entry)).toEqual(["url"]);
    }
  });

  it("leaves /lucrari without images while no project has a photo", () => {
    const entries = sitemapEntries(BASE, [project("a"), project("b")]);
    expect(entries.find((e) => e.url === `${BASE}/lucrari`)).toEqual({ url: `${BASE}/lucrari` });
  });
});

describe("sitemap()", () => {
  it("reads every published project once and builds the entries on siteUrl()", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${BASE}/`);
    const projects = [project("unu", `${MEDIA}/projects/unu/01.webp`), project("doi")];
    mocks.getProjects.mockResolvedValue(projects);

    const entries = await sitemap();

    expect(mocks.getProjects).toHaveBeenCalledTimes(1);
    expect(mocks.getProjects).toHaveBeenCalledWith();
    expect(entries).toEqual(sitemapEntries(BASE, projects));
    expect(entries).toHaveLength(8);
    expect(entries[1]).toEqual({ url: `${BASE}/lucrari`, images: [`${MEDIA}/projects/unu/01.webp`] });
  });
});
