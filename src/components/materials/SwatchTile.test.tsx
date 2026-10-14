import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwatchTile } from "./SwatchTile";
import type { SampleItem } from "./types";

const item: SampleItem = {
  id: "ct-verde",
  name: "Verde sticlă",
  code: "CT01",
  hex: "#2F4B3C",
  familyId: "catifea",
  familyName: "Catifea",
};

describe("SwatchTile", () => {
  it("is a button named after the colour, not pressed, with the add text and the family texture", () => {
    const onToggle = vi.fn();
    render(<SwatchTile item={item} state="add" onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Verde sticlă" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).toHaveAccessibleDescription("+ adaugă mostra");
    expect(screen.getByText("CT01")).toBeInTheDocument();
    const square = button.querySelector(".aspect-square");
    expect(square?.className).toContain("tex-catifea");
    expect(square).toHaveStyle({ backgroundColor: "#2F4B3C" });
    expect(button.querySelector("svg")).toBeNull();

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith("ct-verde");
  });

  it("when in the box: pressed, outlined, with the check disc and „în cutie · {cod}”", () => {
    const onToggle = vi.fn();
    render(<SwatchTile item={item} state="in-box" onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Verde sticlă" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.className).toContain("outline-2");
    expect(button.className).toContain("outline-offset-[3px]");
    expect(button).toHaveAccessibleDescription("în cutie · CT01");
    const disc = button.querySelector("svg")?.parentElement;
    expect(disc?.className).toContain("size-[26px]");
    expect(disc?.className).toContain("bottom-[6px]");
    expect(disc?.className).toContain("right-[6px]");

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith("ct-verde");
  });

  it("when the box is full: not pressed, aria-disabled but focusable, no toggle on click", () => {
    const onToggle = vi.fn();
    render(<SwatchTile item={item} state="full" onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Verde sticlă" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription("cutia e plină");
    button.focus();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows the photo instead of the colour when there is one", () => {
    render(<SwatchTile item={{ ...item, photoSrc: "/mostre/ct01.jpg" }} state="add" onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Verde sticlă" });
    expect(button.querySelector("img")).not.toBeNull();
    expect(button.querySelector(".aspect-square")?.className).not.toContain("tex-catifea");
  });
});
