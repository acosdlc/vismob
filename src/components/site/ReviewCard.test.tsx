import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewCard } from "./ReviewCard";

describe("ReviewCard", () => {
  it("shows the quote, „Prenume, Oraș” and the model line", () => {
    render(<ReviewCard quote="[Recenzie]" name="[Prenume]" city="[Oraș]" model="[Model · dimensiune]" />);
    expect(screen.getByText("[Recenzie]")).toBeInTheDocument();
    expect(screen.getByText("[Prenume], [Oraș]")).toBeInTheDocument();
    expect(screen.getByText("[Model · dimensiune]")).toBeInTheDocument();
  });

  it("drops an empty city and an empty model instead of a trailing comma or an empty line", () => {
    const { container } = render(<ReviewCard quote="Mulțumim!" name="Ana" city="" model="" />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Ana,");
    expect(container.querySelectorAll("figcaption span")).toHaveLength(1);
  });
});
