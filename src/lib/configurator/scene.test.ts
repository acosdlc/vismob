// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { resolve } from "./rules";
import {
  arcuitSeamPath,
  drawingScene,
  escapeAttr,
  headboardPath,
  svgString,
  type DrawingScene,
  type SceneNode,
  type SceneRole,
} from "./scene";
import type { Config } from "./types";

const res = (patch: Partial<Config>) => resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG);
const scene = (patch: Partial<Config>, idPrefix?: string) => drawingScene(res(patch), { idPrefix });

const roleOf = (node: SceneNode): SceneRole | undefined => (node.type === "group" ? node.role : node.role);
const roles = (s: DrawingScene) => s.nodes.map(roleOf);
const byRole = (s: DrawingScene, role: SceneRole) => s.nodes.filter((node) => roleOf(node) === role);
const defIds = (s: DrawingScene) => s.defs.map((d) => d.id);

/** Every fill / filter reference in the scene (`url(#…)`). */
function refs(s: DrawingScene): string[] {
  const out: string[] = [];
  const walk = (node: SceneNode) => {
    if (node.type === "group") {
      node.children.forEach(walk);
      return;
    }
    for (const v of [node.fill, node.filter]) {
      const m = v?.match(/^url\(#(.+)\)$/);
      if (m) out.push(m[1]);
    }
  };
  s.nodes.forEach(walk);
  return out;
}

const ORDER: SceneRole[] = [
  "floor",
  "nightstand",
  "headboard",
  "leg",
  "plinth",
  "led",
  "frame",
  "hidden",
  "mattress",
  "pillow",
];

function expectOrder(s: DrawingScene) {
  const seen = roles(s).map((role) => ORDER.indexOf(role as SceneRole));
  expect(seen).not.toContain(-1);
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
  expect(roleOf(s.nodes[0])).toBe("floor");
  expect(roleOf(s.nodes[s.nodes.length - 1])).toBe("pillow");
}

describe("drawingScene", () => {
  it("default: capitonat on wooden legs, 160 × 200, two pillows", () => {
    const s = scene({});
    expect(s.width).toBe(320);
    expect(s.height).toBe(180);
    expect(s.floor).toBe(156); // 180 - 24
    expectOrder(s);

    const floor = s.nodes[0];
    expect(floor).toMatchObject({ type: "line", x1: 0, x2: 320, y1: 156, y2: 156, stroke: "#18191B", strokeWidth: 1.5 });

    expect(byRole(s, "leg")).toHaveLength(2);
    expect(byRole(s, "plinth")).toHaveLength(0);
    expect(byRole(s, "hidden")).toHaveLength(0);
    expect(byRole(s, "led")).toHaveLength(0);
    expect(byRole(s, "nightstand")).toHaveLength(0);
    expect(byRole(s, "pillow")).toHaveLength(2);
    expect(byRole(s, "pillow")[0]).toMatchObject({ type: "rect", rx: 4, fill: "#FFFFFF" });

    // capitonat pattern + velvet sheen + the wooden legs' grain, all prefixed
    expect(defIds(s)).toEqual(["bed-grain", "bed-sheen", "bed-capitonat"]);
    const pattern = s.defs.find((d) => d.id === "bed-capitonat");
    expect(pattern).toMatchObject({ type: "pattern", width: 10, height: 10, x: 73, y: 36 });
    expect(pattern?.type === "pattern" && pattern.children).toEqual([
      { type: "circle", cx: 2.5, cy: 2.5, r: 0.75, fill: "rgba(0,0,0,.42)" },
      { type: "circle", cx: 7.5, cy: 7.5, r: 0.75, fill: "rgba(0,0,0,.42)" },
    ]);
    const sheen = s.defs.find((d) => d.id === "bed-sheen");
    expect(sheen?.type === "linearGradient" && sheen.stops.map((st) => st.color)).toEqual([
      "rgba(255,255,255,.10)",
      "rgba(0,0,0,.16)",
    ]);

    // headboard: colour, sheen, buttons, outline (top corners rx 3)
    const hb = byRole(s, "headboard")[0];
    expect(hb.type).toBe("group");
    if (hb.type !== "group") return;
    expect(hb.children.map((c) => (c.type === "path" ? c.fill : null))).toEqual([
      "#2F4B3C",
      "url(#bed-sheen)",
      "url(#bed-capitonat)",
      "none",
    ]);
    expect(hb.children[0]).toMatchObject({ d: expect.stringContaining("A3 3 0 0 1 76 36") });

    // wooden legs get the grain
    const leg = byRole(s, "leg")[0];
    expect(leg.type === "group" && leg.children.map((c) => c.type === "rect" && c.fill)).toEqual([
      "#B48A5A",
      "url(#bed-grain)",
      "none",
    ]);

    // every reference points to a def
    for (const ref of refs(s)) expect(defIds(s)).toContain(ref);
  });

  it("arcuit on metal legs: arc path, inner seam, no pattern, thin dark legs", () => {
    const s = scene({ model: "arcuit", base: "metal" });
    expectOrder(s);
    expect(defIds(s)).toEqual(["bed-sheen"]);
    const hb = byRole(s, "headboard")[0];
    if (hb.type !== "group") throw new Error("headboard is a group");
    // headboard 174 × 120 at x 73, top y 36: rx 87, ry 69.6
    expect(hb.children[0]).toMatchObject({ type: "path", d: "M73 156V105.6A87 69.6 0 0 1 247 105.6V156Z", fill: "#2F4B3C" });
    const seam = hb.children.find((c) => c.type === "path" && c.stroke === "rgba(0,0,0,.32)");
    expect(seam).toMatchObject({ fill: "none", strokeWidth: 1, d: "M76.5 156V105.6A83.5 66.1 0 0 1 243.5 105.6V156" });
    const legs = byRole(s, "leg");
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ type: "rect", width: 3.5, fill: "#26282B", stroke: "#18191B" });
  });

  it("canale with ladă: one hidden dashed box, a plinth and no legs", () => {
    const s = scene({ model: "canale", base: "lada" });
    expectOrder(s);
    expect(byRole(s, "leg")).toHaveLength(0);
    expect(byRole(s, "plinth")[0]).toMatchObject({ type: "rect", fill: "#18191B", height: 2 });
    const hidden = byRole(s, "hidden");
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toMatchObject({ fill: "none", strokeDasharray: "4 3", stroke: "rgba(24,25,27,.7)" });
    const pattern = s.defs.find((d) => d.id === "bed-canale");
    expect(pattern).toMatchObject({ type: "pattern", width: 10, height: 10 });
    expect(pattern?.type === "pattern" && pattern.children[0]).toMatchObject({ x: 9.3, width: 0.7, fill: "rgba(0,0,0,.30)" });
    const hb = byRole(s, "headboard")[0];
    expect(hb.type === "group" && hb.children[0]).toMatchObject({ d: expect.stringContaining("A8 8 0 0 1 81 36") });
  });

  it("lamele (lemn family) with sertare: grain overlay, square corners, two hidden drawers", () => {
    const s = scene({ model: "lamele", base: "sertare" });
    expectOrder(s);
    expect(defIds(s)).toEqual(["bed-grain", "bed-lamele"]);
    const pattern = s.defs.find((d) => d.id === "bed-lamele");
    expect(pattern).toMatchObject({ type: "pattern", width: 7, height: 10 });
    expect(pattern?.type === "pattern" && pattern.children[0]).toMatchObject({ x: 6.1, width: 0.9, fill: "rgba(0,0,0,.45)" });
    const hb = byRole(s, "headboard")[0];
    if (hb.type !== "group") throw new Error("headboard is a group");
    expect(hb.children[0]).toMatchObject({ d: "M73 156V36H247V156Z", fill: "#C9A574" });
    expect(hb.children[1]).toMatchObject({ fill: "url(#bed-grain)" });
    expect(byRole(s, "hidden")).toHaveLength(2);
    expect(byRole(s, "plinth")).toHaveLength(1);
    // the frame gets the same grain
    const frame = byRole(s, "frame")[0];
    expect(frame.type === "group" && frame.children.map((c) => c.type === "rect" && c.fill)).toEqual([
      "#C9A574",
      "url(#bed-grain)",
      "none",
    ]);
  });

  it("bouclé stays flat: no texture overlay", () => {
    const s = scene({ family: "boucle", base: "metal" });
    expect(defIds(s)).toEqual(["bed-capitonat"]);
    const frame = byRole(s, "frame")[0];
    expect(frame.type === "group" && frame.children).toHaveLength(2);
  });

  it("led: a glow filter under the strip, drawn between plinth/legs and frame", () => {
    const s = scene({ led: true });
    expectOrder(s);
    const led = byRole(s, "led");
    expect(led).toHaveLength(1);
    if (led[0].type !== "group") throw new Error("led is a group");
    expect(led[0].children[0]).toMatchObject({ fill: "rgba(255,176,72,.55)", filter: "url(#bed-glow)" });
    expect(led[0].children[1]).toMatchObject({ fill: "#FFC46B", x: 85, width: 150, height: 1.2 });
    expect(s.defs.find((d) => d.id === "bed-glow")).toMatchObject({ type: "filter", stdDeviation: 3 });
    const r = roles(s);
    expect(r.indexOf("led")).toBeGreaterThan(r.lastIndexOf("leg"));
    expect(r.indexOf("led")).toBeLessThan(r.indexOf("frame"));
  });

  it("nightstands: two groups with legs, box, drawer line; the world widens at 200", () => {
    const s = scene({ nightstands: true });
    expectOrder(s);
    const stands = byRole(s, "nightstand");
    expect(stands).toHaveLength(2);
    if (stands[0].type !== "group") throw new Error("nightstand is a group");
    const kinds = stands[0].children.map((c) => c.type);
    expect(kinds).toEqual(["rect", "rect", "rect", "rect", "rect", "line"]);
    expect(stands[0].children[0]).toMatchObject({ fill: "#26282B" });
    expect(stands[0].children[2]).toMatchObject({ fill: "#2F4B3C", height: 38 });
    // drawer line at mid height: box y 32..70 → svg 110..148, mid 129
    expect(stands[0].children[5]).toMatchObject({ type: "line", y1: 129, y2: 129 });
    expect(s.width).toBe(320);

    const wide = scene({ nightstands: true, size: "200" });
    expect(wide.width).toBe(326);
    expect(wide.nodes[0]).toMatchObject({ x2: 326 });
  });

  it("w = 90: one pillow", () => {
    const s = scene({ size: "90" });
    expectOrder(s);
    expect(byRole(s, "pillow")).toHaveLength(1);
    expect(byRole(s, "pillow")[0]).toMatchObject({ x: 125, width: 70 });
    expect(byRole(s, "mattress")[0].type === "group" && byRole(s, "mattress")[0]).toMatchObject({
      children: [expect.objectContaining({ width: 90, fill: "#FBFBF9" }), expect.objectContaining({ stroke: "rgba(24,25,27,.25)" })],
    });
  });

  it("custom 150 × 210: mattress 150 wide, two pillows", () => {
    const s = scene({ size: "custom", customW: 150, customL: 210 });
    expectOrder(s);
    const m = byRole(s, "mattress")[0];
    expect(m.type === "group" && m.children[0]).toMatchObject({ width: 150, x: 85 });
    expect(byRole(s, "pillow")).toHaveLength(2);
    // the seam sits 1.5 cm above the mattress base (y 60, h 18 → svg 102..120)
    expect(m.type === "group" && m.children[1]).toMatchObject({ y1: 118.5, y2: 118.5 });
  });

  it("prefixes every id and reference with idPrefix", () => {
    const s = scene({ model: "lamele", led: true, base: "lemn" }, "thumb");
    expect(defIds(s)).toEqual(["thumb-grain", "thumb-lamele", "thumb-glow"]);
    for (const ref of refs(s)) expect(ref.startsWith("thumb-")).toBe(true);
    const other = scene({ model: "lamele", led: true, base: "lemn" }, "main");
    expect(defIds(other).some((id) => defIds(s).includes(id))).toBe(false);
  });
});

describe("headboardPath / arcuitSeamPath", () => {
  it("rounds numbers to 3 decimals", () => {
    expect(headboardPath("arcuit", 0, 0, 100, 100)).toBe("M0 100V58A50 58 0 0 1 100 58V100Z");
    expect(arcuitSeamPath(0, 0, 100, 100)).toBe("M3.5 100V58A46.5 54.5 0 0 1 96.5 58V100");
    expect(headboardPath("lamele", 1, 2, 3, 4)).toBe("M1 6V2H4V6Z");
  });
});

describe("svgString", () => {
  it("serialises a standalone SVG with the viewBox, defs and nodes", () => {
    const svg = svgString(res({ model: "capitonat", led: true, nightstands: true }), { idPrefix: "mail" });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('<pattern id="mail-capitonat" x="73" y="36" width="10" height="10" patternUnits="userSpaceOnUse">');
    expect(svg).toContain('fill="url(#mail-capitonat)"');
    expect(svg).toContain('<linearGradient id="mail-sheen"');
    expect(svg).toContain('<filter id="mail-glow"');
    expect(svg).toContain('<feGaussianBlur stdDeviation="3"/>');
    expect(svgString(res({ base: "lada" }))).toContain('stroke-dasharray="4 3"');
    expect(svg).toContain('<line x1="0" y1="156" x2="320" y2="156" stroke="#18191B" stroke-width="1.5" vector-effect="non-scaling-stroke" data-role="floor"/>');
    expect(svg).toContain('<g data-role="nightstand">');
    expect(svg).toContain('data-role="pillow"');
    expect(svg).not.toContain("undefined");
  });

  it("widens the viewBox with nightstands at 200 and uses each model's pattern id", () => {
    expect(svgString(res({ size: "200", nightstands: true }))).toContain('viewBox="0 0 326 180"');
    expect(svgString(res({ model: "canale" }))).toContain('id="bed-canale"');
    expect(svgString(res({ model: "lamele" }))).toContain('id="bed-lamele"');
    expect(svgString(res({ model: "arcuit" }))).not.toContain('id="bed-arcuit"');
    expect(svgString(res({ model: "arcuit" }))).toContain('stroke="rgba(0,0,0,.32)"');
  });

  it("escapes attribute values", () => {
    expect(escapeAttr('a<b>&"c"')).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
    expect(svgString(res({}))).not.toMatch(/="[^"]*<[^"]*"/);
  });
});
