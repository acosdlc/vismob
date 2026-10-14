import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG, resolve, type Config } from "@/lib/configurator";
import { BedDrawing } from "./BedDrawing";

const res = (patch: Partial<Config> = {}) => resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG);

function renderSvg(ui: React.ReactElement) {
  const { container } = render(ui);
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  return svg as SVGSVGElement;
}

describe("BedDrawing", () => {
  it("renders an aria-hidden svg with the viewBox, the code and the className", () => {
    const svg = renderSvg(<BedDrawing resolved={res()} className="h-12 w-12" />);
    expect(svg.getAttribute("viewBox")).toBe("0 0 320 180");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("data-code")).toBe("CAP-160x200-CT01-H120-PL");
    expect(svg.getAttribute("class")).toBe("h-12 w-12");
  });

  it("draws the §5.5 order: floor, headboard, legs, frame, mattress, pillows", () => {
    const svg = renderSvg(<BedDrawing resolved={res()} />);
    const roles = Array.from(svg.children)
      .filter((el) => el.tagName !== "defs")
      .map((el) => el.getAttribute("data-role"));
    expect(roles).toEqual(["floor", "headboard", "leg", "leg", "frame", "mattress", "pillow", "pillow"]);
    expect(svg.children[0].tagName).toBe("defs");
    const floor = svg.querySelector('[data-role="floor"]');
    expect(floor?.tagName).toBe("line");
    expect(floor?.getAttribute("y1")).toBe("156");
  });

  it("gives every stroked element a non-scaling stroke and the outlines 1.5 ink", () => {
    const svg = renderSvg(<BedDrawing resolved={res({ base: "lada", led: true })} />);
    const stroked = Array.from(svg.querySelectorAll("[stroke]"));
    expect(stroked.length).toBeGreaterThan(5);
    for (const el of stroked) expect(el.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    const outlines = stroked.filter((el) => el.getAttribute("stroke") === "#18191B");
    for (const el of outlines) expect(el.getAttribute("stroke-width")).toBe("1.5");
    const hidden = svg.querySelector('[data-role="hidden"]');
    expect(hidden?.getAttribute("stroke-dasharray")).toBe("4 3");
    expect(hidden?.getAttribute("fill")).toBe("none");
    const led = svg.querySelector('[data-role="led"] [filter]');
    expect(led?.getAttribute("filter")).toBe("url(#bed-glow)");
    expect(svg.querySelector("filter#bed-glow feGaussianBlur")?.getAttribute("stdDeviation")).toBe("3");
  });

  it("maps the defs: pattern, gradient and their references", () => {
    const svg = renderSvg(<BedDrawing resolved={res()} idPrefix="main" />);
    const pattern = svg.querySelector("pattern#main-capitonat");
    expect(pattern?.getAttribute("patternUnits")).toBe("userSpaceOnUse");
    expect(pattern?.getAttribute("width")).toBe("10");
    expect(pattern?.querySelectorAll("circle")).toHaveLength(2);
    const gradient = svg.querySelector("linearGradient#main-sheen");
    expect(gradient?.querySelectorAll("stop")).toHaveLength(2);
    expect(gradient?.querySelector("stop")?.getAttribute("stop-color")).toBe("rgba(255,255,255,.10)");
    expect(svg.querySelector('[fill="url(#main-capitonat)"]')).not.toBeNull();
    expect(svg.querySelector('[fill="url(#main-sheen)"]')).not.toBeNull();
    expect(svg.querySelector('[fill="url(#main-grain)"]')).not.toBeNull(); // wooden legs
  });

  it("widens the viewBox with nightstands at 200 and prefixes ids", () => {
    const { container } = render(
      <>
        <BedDrawing resolved={res({ size: "200", nightstands: true })} idPrefix="a" />
        <BedDrawing resolved={res({ size: "200", nightstands: true })} idPrefix="b" />
      </>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs[0].getAttribute("viewBox")).toBe("0 0 326 180");
    expect(svgs[0].querySelectorAll('[data-role="nightstand"]')).toHaveLength(2);
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("a-") || id.startsWith("b-"))).toBe(true);
  });
});
