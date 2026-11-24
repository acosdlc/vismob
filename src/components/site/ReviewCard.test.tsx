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

  it("keeps the line breaks of a review typed in paragraphs", () => {
    const quote = "Patul a venit la timp.\n\nMontajul a durat o oră.";
    const { container } = render(<ReviewCard quote={quote} name="Ana" city="Cluj" model="" />);
    const paragraph = container.querySelector("blockquote p");
    // The text is printed as stored; pre-line is what makes the browser break the lines.
    expect(paragraph?.textContent).toBe(quote);
    expect(paragraph?.className).toContain("whitespace-pre-line");
  });
});
