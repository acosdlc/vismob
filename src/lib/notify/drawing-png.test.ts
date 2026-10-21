// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { configCode } from "@/lib/configurator/format";
import { resolve } from "@/lib/configurator/rules";
import type { Config } from "@/lib/configurator/types";

vi.mock("server-only", () => ({}));

import { DRAWING_PNG_WIDTH, drawingAttachment, renderDrawingPng } from "./drawing-png";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height from the IHDR chunk, which always follows the 8-byte signature. */
function ihdr(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(png.toString("latin1", 12, 16)).toBe("IHDR");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const res = (patch: Partial<Config> = {}) => resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG);

/** With DRAWING_SAMPLE_OUT=/path/to/drawing-sample.png the rendered files are kept for a look. */
function keepSample(png: Buffer, suffix = "") {
  const out = process.env.DRAWING_SAMPLE_OUT;
  if (!out) return;
  const file = suffix ? out.replace(/\.png$/, `-${suffix}.png`) : out;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
}

describe("renderDrawingPng", () => {
  it("renders the default drawing as a PNG 1600px wide", async () => {
    const png = await renderDrawingPng(res());
    const { width, height } = ihdr(png);
    expect(width).toBe(DRAWING_PNG_WIDTH);
    expect(height).toBeGreaterThan(0);
    // The sheet is wider than tall (W × 180 cm plus the bar and the caption).
    expect(height).toBeLessThan(width);
    keepSample(png);
  });

  it("takes a width and a code", async () => {
    const png = await renderDrawingPng(res(), { width: 800, code: "TEST-1" });
    expect(ihdr(png).width).toBe(800);
  });

  it("renders a wider world (nightstands) and every base and model", async () => {
    const variants: Array<[string, Partial<Config>]> = [
      ["nightstands", { size: "200", nightstands: true, led: true, base: "sertare", model: "arcuit", family: "stofa", color: "sf-denim" }],
      ["lada", { model: "canale", base: "lada", led: true, family: "piele", color: "pe-coniac" }],
      ["lamele", { model: "lamele", base: "metal", size: "90", family: "lemn", color: "lm-stejar" }],
    ];
    for (const [name, patch] of variants) {
      const png = await renderDrawingPng(res(patch));
      expect(ihdr(png).width).toBe(DRAWING_PNG_WIDTH);
      keepSample(png, name);
    }
  });
});

describe("drawingAttachment", () => {
  it("names the file after the code and carries the PNG", async () => {
    const r = res();
    const attachment = await drawingAttachment(r);
    expect(attachment.filename).toBe(`desen-${configCode(r)}.png`);
    expect(ihdr(attachment.content).width).toBe(DRAWING_PNG_WIDTH);
  });

  it("uses the code it is given", async () => {
    const attachment = await drawingAttachment(res(), "CAP-160x200-X");
    expect(attachment.filename).toBe("desen-CAP-160x200-X.png");
  });
});
