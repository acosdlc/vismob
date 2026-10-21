import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwatchTile } from "./SwatchTile";
import type { SwatchItem } from "./types";

const item: SwatchItem = {
  id: "ct-verde",
  name: "Verde sticlă",
  code: "CT01",
  hex: "#2F4B3C",
  familyId: "catifea",
  familyName: "Catifea",
  modelId: "capitonat",
};

describe("SwatchTile", () => {
  it("is a link to the configurator showing the name, the code and the family texture", () => {
    render(<SwatchTile item={item} href="/configurator?m=capitonat&f=catifea&c=ct-verde" />);
    const link = screen.getByRole("link", { name: /Verde sticlă/ });
    expect(link).toHaveAttribute("href", "/configurator?m=capitonat&f=catifea&c=ct-verde");
    expect(link).toHaveAttribute("data-color", "ct-verde");
    expect(screen.getByText("CT01")).toBeInTheDocument();
    const square = link.querySelector(".aspect-square");
    expect(square?.className).toContain("tex-catifea");
    expect(square).toHaveStyle({ backgroundColor: "#2F4B3C" });
    expect(link.querySelector("img")).toBeNull();
    expect(link.querySelector("[aria-pressed]")).toBeNull();
  });

  it("shows the photo instead of the colour when there is one", () => {
    render(<SwatchTile item={{ ...item, photoSrc: "/mostre/ct01.jpg" }} href="/configurator" />);
    const link = screen.getByRole("link", { name: /Verde sticlă/ });
    expect(link.querySelector("img")).not.toBeNull();
    expect(link.querySelector(".aspect-square")?.className).not.toContain("tex-catifea");
  });
});
