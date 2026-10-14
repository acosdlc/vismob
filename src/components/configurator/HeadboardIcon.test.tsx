import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeadboardIcon, iconPath } from "./HeadboardIcon";

describe("HeadboardIcon", () => {
  it("is a 64×40 decorative SVG in the line-art style", () => {
    const { container } = render(<HeadboardIcon model="capitonat" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 64 40");
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "40");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    const outline = svg.querySelector('path[fill="none"]')!;
    expect(outline).toHaveAttribute("stroke", "#18191B");
    expect(outline).toHaveAttribute("stroke-width", "1.5");
    expect(outline).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(svg.querySelector("path")).toHaveAttribute("fill", "#F7F7F4");
  });

  it("draws each model's detail: dots, arc seam, channels, slats", () => {
    const dots = render(<HeadboardIcon model="capitonat" idPrefix="a" />).container;
    expect(dots.querySelector("pattern#a-capitonat-dots")).not.toBeNull();
    expect(dots.querySelectorAll("circle")).toHaveLength(2);
    expect(dots.querySelector('path[fill="url(#a-capitonat-dots)"]')).not.toBeNull();

    const arc = render(<HeadboardIcon model="arcuit" />).container;
    expect(iconPath("arcuit")).toContain("A30 20.88 0 0 1");
    expect(arc.querySelectorAll('path[fill="none"]')).toHaveLength(2); // seam + outline
    expect(arc.querySelectorAll("line")).toHaveLength(0);

    const canale = render(<HeadboardIcon model="canale" />).container;
    const lamele = render(<HeadboardIcon model="lamele" />).container;
    const canaleLines = canale.querySelectorAll("line").length;
    const lameleLines = lamele.querySelectorAll("line").length;
    expect(canaleLines).toBeGreaterThan(0);
    expect(lameleLines).toBeGreaterThan(canaleLines); // closer lines
    expect(iconPath("lamele")).toBe("M2 38V2H62V38Z"); // square corners
    expect(iconPath("canale")).toContain("A8 8 0 0 1");
    expect(iconPath("capitonat")).toContain("A4 4 0 0 1");
  });
});
