import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecList } from "./SpecList";

describe("SpecList", () => {
  it("renders the items as dt/dd pairs, in order", () => {
    const { container } = render(
      <SpecList
        items={[
          { k: "Telefon", v: <a href="tel:0722123456">0722 123 456</a> },
          { k: "Program", v: "Luni–Vineri 9–18" },
        ]}
      />,
    );
    expect(Array.from(container.querySelectorAll("dt")).map((el) => el.textContent)).toEqual(["Telefon", "Program"]);
    expect(Array.from(container.querySelectorAll("dd")).map((el) => el.textContent)).toEqual(["0722 123 456", "Luni–Vineri 9–18"]);
    expect(screen.getByRole("link", { name: "0722 123 456" }).closest("dd")).not.toBeNull();
  });

  it("keeps the line breaks of a value typed on several lines", () => {
    const hours = "Luni–Vineri 9–18\nSâmbătă 10–14";
    render(<SpecList items={[{ k: "Program", v: hours }]} />);
    const value = screen.getByText("Program").nextElementSibling;
    expect(value?.tagName).toBe("DD");
    // The text is printed as stored; pre-line is what makes the browser break the lines.
    expect(value?.textContent).toBe(hours);
    expect(value?.className).toContain("whitespace-pre-line");
  });
});
