// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { bedGeometry, svgY } from "./geometry";
import { resolve } from "./rules";
import type { Config } from "./types";

const geo = (patch: Partial<Config>) => bedGeometry(resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG));

describe("bedGeometry", () => {
  it("160 capitonat on wooden legs (default)", () => {
    const g = geo({});
    expect(g.world).toEqual({ w: 320, h: 180, floor: 24 });
    expect(g.mattress).toEqual({ x: 80, y: 60, w: 160, h: 18 });
    expect(g.frame).toEqual({ x: 75, y: 36, w: 170, h: 24 });
    expect(g.headboard).toEqual({ x: 73, y: 24, w: 174, h: 120 });
    expect(g.legs).toHaveLength(2);
    expect(g.legs[0]).toMatchObject({ w: 5, h: 12, y: 24 });
    expect(g.plinth).toBeUndefined();
    expect(g.hidden).toEqual([]);
    expect(g.led).toBeUndefined();
    expect(g.nightstands).toEqual([]);
    expect(g.pillows).toHaveLength(2);
    expect(g.dimWidth).toEqual({ x1: 80, x2: 240, label: "160 cm" });
    expect(g.dimHeight).toEqual({ y1: 24, y2: 144, label: "120 cm" });
    expect(g).toMatchSnapshot();
  });

  it("200 with nightstands widens the world", () => {
    const g = geo({ size: "200", nightstands: true });
    expect(g.world.w).toBe(326); // 214 + 2 × 48 + 16 > 320
    expect(g.nightstands).toHaveLength(2);
    expect(g.nightstands[0].box).toMatchObject({ w: 44, h: 38, y: 32 });
    expect(g.nightstands[0].legs).toHaveLength(2);
    expect(g.nightstands[1].box.x).toBeGreaterThan(g.headboard.x + g.headboard.w);
    expect(g).toMatchSnapshot();
  });

  it("90 has one pillow", () => {
    const g = geo({ size: "90" });
    expect(g.pillows).toHaveLength(1);
    expect(g.pillows[0]).toEqual({ x: 125, y: 78, w: 70, h: 16 });
    expect(g.dimWidth.label).toBe("90 cm");
    expect(g).toMatchSnapshot();
  });

  it("ladă: no legs, a plinth and one hidden box", () => {
    const g = geo({ base: "lada" });
    expect(g.legs).toEqual([]);
    expect(g.plinth).toEqual({ x: 79, y: 24, w: 162, h: 2 });
    expect(g.frame).toMatchObject({ y: 26, h: 34 });
    expect(g.hidden).toHaveLength(1);
    expect(g).toMatchSnapshot();
  });

  it("sertare: two hidden drawers", () => {
    const g = geo({ base: "sertare" });
    expect(g.legs).toEqual([]);
    expect(g.hidden).toHaveLength(2);
    expect(g.hidden[0].w).toBe(g.hidden[1].w);
    expect(g.hidden[1].x).toBeGreaterThan(g.hidden[0].x + g.hidden[0].w);
    expect(g).toMatchSnapshot();
  });

  it("metal legs are thinner", () => {
    const g = geo({ base: "metal" });
    expect(g.legs).toHaveLength(2);
    expect(g.legs[0].w).toBe(3.5);
    expect(g.legs[1].w).toBe(3.5);
    expect(g).toMatchSnapshot();
  });

  it("LED on legs sits under the frame", () => {
    const g = geo({ led: true });
    expect(g.led).toEqual({ x: 85, y: 34, w: 150, h: 1.2 });
    expect(geo({ led: true, base: "lada" }).led?.y).toBe(24.6);
    expect(g).toMatchSnapshot();
  });

  it("custom 220 arcuit with a 140 headboard", () => {
    const g = geo({ model: "arcuit", size: "custom", customW: 220, customL: 200, hb: 140 });
    expect(g.world.w).toBe(320);
    expect(g.mattress.w).toBe(220);
    expect(g.headboard).toMatchObject({ w: 234, h: 140 });
    expect(g.dimWidth.label).toBe("220 cm");
    expect(g.dimHeight).toEqual({ y1: 24, y2: 164, label: "140 cm" });
    expect(g).toMatchSnapshot();
  });
});

describe("svgY", () => {
  it("flips the y axis", () => {
    expect(svgY({ x: 0, y: 24, w: 10, h: 12 }, 180)).toBe(144);
    expect(svgY({ x: 0, y: 0, w: 10, h: 180 }, 180)).toBe(0);
  });
});
