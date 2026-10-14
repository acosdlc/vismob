import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { ModelFilter, modelHref, parseModelParam } from "./ModelFilter";

describe("ModelFilter", () => {
  it("renders the DESIGN §4.4 pills in order, as links into the URL state", () => {
    render(<ModelFilter models={SEED_CATALOG.models} active={null} />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Toate", "Capitonat", "Arcuit", "Canale", "Lamele"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/lucrari",
      "/lucrari?model=capitonat",
      "/lucrari?model=arcuit",
      "/lucrari?model=canale",
      "/lucrari?model=lamele",
    ]);
    for (const link of links) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("border-[1.5px]");
      expect(link.className).toContain("font-mono");
    }
  });

  it("marks „Toate” as the current page without a filter", () => {
    render(<ModelFilter models={SEED_CATALOG.models} active={null} />);
    expect(screen.getByRole("link", { name: "Toate" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Arcuit" })).not.toHaveAttribute("aria-current");
  });

  it("marks the active model's pill with aria-current and the ink background", () => {
    render(<ModelFilter models={SEED_CATALOG.models} active="arcuit" />);
    const active = screen.getByRole("link", { name: "Arcuit" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("bg-ink");
    expect(active.className).toContain("text-white");
    expect(screen.getByRole("link", { name: "Toate" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Capitonat" }).className.split(" ")).not.toContain("bg-ink");
  });

  it("marks nothing while the URL is not known yet (the Suspense fallback)", () => {
    render(<ModelFilter models={SEED_CATALOG.models} />);
    for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
  });
});

describe("parseModelParam", () => {
  it("accepts only the catalogue's model ids", () => {
    expect(parseModelParam("arcuit", SEED_CATALOG.models)).toBe("arcuit");
    expect(parseModelParam(["lamele", "arcuit"], SEED_CATALOG.models)).toBe("lamele");
    expect(parseModelParam("altceva", SEED_CATALOG.models)).toBeNull();
    expect(parseModelParam("", SEED_CATALOG.models)).toBeNull();
    expect(parseModelParam(undefined, SEED_CATALOG.models)).toBeNull();
  });

  it("builds the hrefs of the pills", () => {
    expect(modelHref(null)).toBe("/lucrari");
    expect(modelHref("canale")).toBe("/lucrari?model=canale");
  });
});
