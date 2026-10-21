import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { caption, configCode } from "./format";
import { bedGeometry } from "./geometry";
import { resolve, type Resolved } from "./rules";
import { sheetSvg } from "./sheet";
import type { Config } from "./types";

const res = (patch: Partial<Config> = {}) => resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG);

/** The SVG parsed as XML (jsdom's DOMParser), so a malformed document fails here. */
function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
}

const viewBox = (svg: string) => {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  expect(m).not.toBeNull();
  return { w: Number(m![1]), h: Number(m![2]) };
};

const SHEET_ROLES = ["bar", "paper", "drawing", "dim-width", "dim-height", "scale", "caption"];
const SCENE_ROLES = ["floor", "headboard", "leg", "frame", "mattress", "pillow"];

describe("sheetSvg", () => {
  it("is one well-formed svg document with defs and every part of the sheet", () => {
    const svg = sheetSvg(res());
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    expect(svg.match(/<defs>/g)).toHaveLength(1);

    const doc = parse(svg);
    expect(doc.documentElement.tagName).toBe("svg");
    const { w, h } = viewBox(svg);
    expect(doc.documentElement.getAttribute("width")).toBe(String(w));
    expect(doc.documentElement.getAttribute("height")).toBe(String(h));
    for (const role of [...SHEET_ROLES, ...SCENE_ROLES]) {
      expect(doc.querySelector(`[data-role="${role}"]`), role).not.toBeNull();
    }
  });

  it("has every text in DM Mono, in ink colours", () => {
    const doc = parse(sheetSvg(res()));
    const texts = Array.from(doc.querySelectorAll("text"));
    expect(texts.length).toBeGreaterThanOrEqual(6);
    for (const t of texts) {
      expect(t.getAttribute("font-family")).toBe("DM Mono");
      expect(["#18191B", "#4A4D52", "#5F6268"]).toContain(t.getAttribute("fill"));
    }
  });

  it("shows the bar text uppercase, the code and the caption, escaped", () => {
    const r = res();
    const svg = sheetSvg(r);
    expect(svg).toContain("DESEN LA SCARĂ · VEDERE DIN FAȚĂ");
    expect(svg).toContain(`>${configCode(r)}</text>`);
    expect(svg).toContain(`>${caption(r)}</text>`);

    const custom = sheetSvg(r, { code: 'A&B<"C>' });
    expect(custom).toContain(">A&amp;B&lt;&quot;C&gt;</text>");
    expect(custom).not.toContain('A&B<"C>');
    parse(custom);
  });

  it("labels the width and height dimensions from the geometry", () => {
    const doc = parse(sheetSvg(res({ size: "custom", customW: 150, customL: 210, hb: 140 })));
    expect(doc.querySelector('[data-role="dim-width"] text')?.textContent).toBe("150 cm");
    const height = doc.querySelector('[data-role="dim-height"] text');
    expect(height?.textContent).toBe("140 cm");
    expect(height?.getAttribute("transform")).toMatch(/^rotate\(-90 /);
    expect(doc.querySelector('[data-role="scale"] text')?.textContent).toBe("0 — 50 cm");
  });

  it("places the drawing at the paper's origin and keeps the scene's defs under the prefix", () => {
    const svg = sheetSvg(res(), { idPrefix: "mail" });
    expect(svg).toContain('id="mail-grid"');
    expect(svg).toContain('id="mail-capitonat"');
    expect(svg).toContain("url(#mail-capitonat)");
    expect(svg).not.toContain('id="bed-');
    expect(svg).toMatch(/<g data-role="drawing" transform="translate\([\d.]+ [\d.]+\)">/);
  });

  it("widens with the world when the bed has nightstands", () => {
    const plain = res({ size: "200" });
    const wide = res({ size: "200", nightstands: true });
    expect(bedGeometry(wide).world.w).toBeGreaterThan(bedGeometry(plain).world.w);
    const a = viewBox(sheetSvg(plain));
    const b = viewBox(sheetSvg(wide));
    expect(b.w).toBeGreaterThan(a.w);
    expect(b.w - a.w).toBeGreaterThan(bedGeometry(wide).world.w - bedGeometry(plain).world.w - 1);
    expect(b.h).toBeGreaterThan(a.h);
    expect(parse(sheetSvg(wide)).querySelectorAll('[data-role="nightstand"]')).toHaveLength(2);
  });

  it("fits the caption on the sheet by shrinking its font", () => {
    const r = res();
    const fontSize = (resolved: Resolved) => {
      const t = parse(sheetSvg(resolved)).querySelector('[data-role="caption"] text');
      return Number(t?.getAttribute("font-size"));
    };
    const normal = fontSize(r);
    expect(normal).toBeGreaterThan(0);
    const long: Resolved = { ...r, family: { ...r.family, name: "Catifea cu o denumire foarte, foarte lungă".repeat(3) } };
    const shrunk = fontSize(long);
    expect(shrunk).toBeLessThan(normal);
    // 0.6 em per character, inside the sheet's width.
    const { w } = viewBox(sheetSvg(long));
    expect(caption(long).length * 0.6 * shrunk).toBeLessThanOrEqual(w);
  });
});
