import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Faq } from "./Faq";

describe("Faq", () => {
  it("renders each question as the summary of a details element, with its answer inside", () => {
    render(
      <Faq
        items={[
          { q: "Cât durează?", a: "Patru săptămâni." },
          { q: "Vindeți și saltele?", a: "Nu." },
        ]}
      />,
    );
    const question = screen.getByText("Cât durează?");
    expect(question.closest("summary")).not.toBeNull();
    expect(question.closest("details")).toHaveTextContent("Patru săptămâni.");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the line breaks of an answer typed on several lines", () => {
    const answer = "Livrăm în tot județul.\nÎn afara lui, la cerere.";
    render(<Faq items={[{ q: "Livrați și în afara orașului?", a: answer }]} />);
    const paragraph = screen.getByText("Livrați și în afara orașului?").closest("details")?.querySelector("p");
    // The text is printed as stored; pre-line is what makes the browser break the lines.
    expect(paragraph?.textContent).toBe(answer);
    expect(paragraph?.className).toContain("whitespace-pre-line");
  });
});
