import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG, resolve, type Config } from "@/lib/configurator";
import { DrawingFigure } from "./DrawingFigure";

const res = (patch: Partial<Config> = {}) => resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG);

describe("DrawingFigure", () => {
  it("renders the bar texts, the code and the caption of the default configuration", () => {
    const { container } = render(<DrawingFigure resolved={res()} />);
    expect(container.querySelector("figure")).not.toBeNull();
    expect(screen.getByText("Desen la scară · vedere din față")).toBeInTheDocument();
    expect(screen.getByText("CAP-160x200-CT01-H120-PL")).toBeInTheDocument();
    expect(container.querySelector("figcaption")?.textContent).toBe(
      "Capitonat · catifea, verde sticlă · 160 × 200 cm · tăblie 120 cm · picioare din lemn",
    );
  });

  it("hides the drawing from screen readers and sizes it to the world", () => {
    const { container } = render(<DrawingFigure resolved={res()} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 320 180");
    expect(svg?.parentElement?.style.aspectRatio).toBe("320 / 180");

    const wide = render(<DrawingFigure resolved={res({ size: "200", nightstands: true })} idPrefix="wide" />);
    expect(wide.container.querySelector("svg")?.parentElement?.style.aspectRatio).toBe("326 / 180");
  });

  it("shows the width and height dimensions and the scale label", () => {
    const { container } = render(<DrawingFigure resolved={res()} />);
    expect(screen.getByText("160 cm")).toBeInTheDocument();
    expect(screen.getByText("120 cm")).toBeInTheDocument();
    expect(screen.getByText("0 — 50 cm")).toBeInTheDocument();

    // width: from x1 80 to x2 240 of 320; height: bottom 24/180, height 120/180
    const width = container.querySelector<HTMLElement>('[data-dim="width"]');
    expect(width?.style.left).toBe("25%");
    expect(width?.style.width).toBe("50%");
    const height = container.querySelector<HTMLElement>('[data-dim="height"]');
    expect(height?.style.bottom).toBe(`${(24 / 180) * 100}%`);
    expect(height?.style.height).toBe(`${(120 / 180) * 100}%`);
    const scale = container.querySelector<HTMLElement>("[data-scale]");
    expect(scale?.style.width).toBe("15.625%"); // 50 of 320

    // the overlay is decorative; the values are in the figcaption
    for (const el of container.querySelectorAll("[data-dim], [data-scale]")) {
      expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("follows the configuration: custom width, headboard 140, ladă", () => {
    render(<DrawingFigure resolved={res({ size: "custom", customW: 150, customL: 210, hb: 140, base: "lada" })} />);
    expect(screen.getByText("150 cm")).toBeInTheDocument();
    expect(screen.getByText("140 cm")).toBeInTheDocument();
    expect(screen.getByText("CAP-150x210-CT01-H140-LD")).toBeInTheDocument();
    expect(
      screen.getByText("Capitonat · catifea, verde sticlă · 150 × 210 cm · tăblie 140 cm · ladă de depozitare"),
    ).toBeInTheDocument();
  });

  it("keeps element ids unique across two figures with different idPrefix", () => {
    const { container } = render(
      <>
        <DrawingFigure resolved={res({ led: true })} idPrefix="main" />
        <DrawingFigure resolved={res({ led: true })} idPrefix="thumb" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("main-glow");
    expect(ids).toContain("thumb-glow");
  });
});
