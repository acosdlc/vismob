import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BedLineArt, type BedModel } from "./BedLineArt";

const MODELS: BedModel[] = ["capitonat", "arcuit", "canale", "lamele"];

function renderSvg(ui: React.ReactElement) {
  const { container } = render(ui);
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  return svg as SVGSVGElement;
}

describe("BedLineArt", () => {
  it.each(MODELS)("renders the %s model with the eight §3.9 elements in order", (model) => {
    const svg = renderSvg(<BedLineArt model={model} />);
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 150");
    expect(svg.getAttribute("aria-hidden")).toBe("true");

    // floor first, then the headboard group, then legs, frame, mattress and pillows
    const children = Array.from(svg.children);
    expect(children[0].tagName).toBe("line");
    expect(children[0].getAttribute("y1")).toBe("130"); // y 20 from the floor → 150 - 20
    expect(children[1].tagName).toBe("g");
    expect(children[1].getAttribute("data-headboard")).toBe(model);

    const rects = svg.querySelectorAll(":scope > rect");
    const boxes = Array.from(rects).map((r) =>
      ["x", "y", "width", "height"].map((a) => Number(r.getAttribute(a))),
    );
    expect(boxes).toEqual([
      [34, 120, 6, 10], // leg left: y 20, h 10 → 150 - 20 - 10
      [160, 120, 6, 10],
      [26, 95, 148, 25], // frame: y 30, h 25
      [32, 80, 136, 15], // mattress: y 55, h 15
      [44, 66, 52, 14], // pillows: y 70, h 14
      [104, 66, 52, 14],
    ]);
    expect(rects[4].getAttribute("rx")).toBe("5");
    expect(rects[5].getAttribute("rx")).toBe("5");

    // the headboard outline starts at the bottom-left corner (30, 130)
    const outline = svg.querySelector("g > path:last-of-type");
    expect(outline?.getAttribute("d")?.startsWith("M30 130")).toBe(true);
    expect(outline?.getAttribute("fill")).toBe("none");
  });

  it("gives every outline a 1.5 non-scaling stroke in ink, with card and white fills", () => {
    const svg = renderSvg(<BedLineArt model="capitonat" />);
    const stroked = svg.querySelectorAll("[stroke]");
    expect(stroked.length).toBeGreaterThan(0);
    for (const el of stroked) {
      expect(el.getAttribute("stroke")).toBe("#18191B");
      expect(el.getAttribute("stroke-width")).toBe("1.5");
      expect(el.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    }
    const fills = new Set(Array.from(svg.querySelectorAll("[fill]")).map((el) => el.getAttribute("fill")));
    expect(fills.has("#F7F7F4")).toBe(true); // card
    expect(fills.has("#FFFFFF")).toBe(true); // mattress and pillows
  });

  it("draws the capitonat buttons as a 13×13 pattern with two dots", () => {
    const svg = renderSvg(<BedLineArt model="capitonat" />);
    const pattern = svg.querySelector("pattern");
    expect(pattern).not.toBeNull();
    expect(pattern?.getAttribute("width")).toBe("13");
    expect(pattern?.getAttribute("height")).toBe("13");
    expect(pattern?.getAttribute("patternUnits")).toBe("userSpaceOnUse");
    const dots = Array.from(pattern!.querySelectorAll("circle")).map((c) => [
      c.getAttribute("cx"),
      c.getAttribute("cy"),
      c.getAttribute("r"),
    ]);
    expect(dots).toEqual([
      ["3", "3", "1"],
      ["9.5", "9.5", "1"],
    ]);
    const id = pattern!.getAttribute("id");
    expect(svg.querySelector(`[fill="url(#${id})"]`)).not.toBeNull();
  });

  it("draws the arched headboard with the elliptical top and an inner seam", () => {
    const svg = renderSvg(<BedLineArt model="arcuit" />);
    const paths = Array.from(svg.querySelectorAll("g > path")).map((p) => p.getAttribute("d"));
    // rx = 140 / 2 = 70, ry = 0.58 × 100 = 58; the arc starts 58 under the top edge
    expect(paths[0]).toBe("M30 130V88A70 58 0 0 1 170 88V130Z");
    // seam 4 units in, open at the base
    expect(paths[1]).toBe("M34 130V88A66 54 0 0 1 166 88V130");
  });

  it("draws vertical lines every 13 units for canale and every 8 for lamele", () => {
    const canale = renderSvg(<BedLineArt model="canale" />);
    const canaleXs = Array.from(canale.querySelectorAll("g > line")).map((l) => Number(l.getAttribute("x1")));
    expect(canaleXs).toEqual([43, 56, 69, 82, 95, 108, 121, 134, 147, 160]);
    expect(canale.querySelector("g > path")?.getAttribute("d")).toContain("A10 10 0 0 1 40 30");

    const lamele = renderSvg(<BedLineArt model="lamele" />);
    const lameleXs = Array.from(lamele.querySelectorAll("g > line")).map((l) => Number(l.getAttribute("x1")));
    expect(lameleXs).toEqual([38, 46, 54, 62, 70, 78, 86, 94, 102, 110, 118, 126, 134, 142, 150, 158, 166]);
    expect(lamele.querySelector("g > path")?.getAttribute("d")).toBe("M30 130V30H170V130Z");
    for (const line of lamele.querySelectorAll("g > line")) {
      expect(line.getAttribute("y1")).toBe("30");
      expect(line.getAttribute("y2")).toBe("130");
    }
  });

  it("uses on-dark outlines and dots with accent fills in the dark tone", () => {
    const svg = renderSvg(<BedLineArt model="capitonat" tone="dark" />);
    for (const el of svg.querySelectorAll("[stroke]")) {
      expect(el.getAttribute("stroke")).toBe("#F3F3F0");
    }
    const dots = svg.querySelectorAll("pattern circle");
    expect(dots.length).toBe(2);
    for (const dot of dots) {
      expect(dot.getAttribute("fill")).toBe("#F3F3F0");
    }
    const fills = Array.from(svg.querySelectorAll("[fill]"))
      .map((el) => el.getAttribute("fill")!)
      .filter((f) => f !== "none" && !f.startsWith("url(") && f !== "#F3F3F0");
    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(fills)).toEqual(new Set(["#1E4D3B"]));
  });

  it("keeps pattern ids unique through idPrefix", () => {
    const { container } = render(
      <>
        <BedLineArt model="capitonat" idPrefix="card-1" />
        <BedLineArt model="capitonat" idPrefix="card-2" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("pattern")).map((p) => p.getAttribute("id"));
    expect(ids).toEqual(["card-1-capitonat-dots", "card-2-capitonat-dots"]);
    expect(new Set(ids).size).toBe(2);
    expect(container.querySelector('[fill="url(#card-1-capitonat-dots)"]')).not.toBeNull();
    expect(container.querySelector('[fill="url(#card-2-capitonat-dots)"]')).not.toBeNull();
  });

  it("passes className through to the svg", () => {
    const svg = renderSvg(<BedLineArt model="lamele" className="h-full w-full" />);
    expect(svg.getAttribute("class")).toBe("h-full w-full");
  });
});
