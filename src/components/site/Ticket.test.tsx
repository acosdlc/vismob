import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Ticket } from "./Ticket";

const ROWS = [
  { k: "Model", v: "Capitonat" },
  { k: "Saltea", v: "180 × 200 cm" },
  { k: "Material", v: "Catifea, verde sticlă" },
];

describe("Ticket", () => {
  it("renders the title bar with the number and the rows as dt/dd", () => {
    render(<Ticket title="FIȘĂ PROIECT" number="Nr. 0123" rows={ROWS} />);
    expect(screen.getByText("FIȘĂ PROIECT")).toBeInTheDocument();
    expect(screen.getByText("Nr. 0123")).toBeInTheDocument();

    const dl = screen.getByText("Model").closest("dl");
    expect(dl).not.toBeNull();
    expect(screen.getByText("Model").tagName).toBe("DT");
    expect(screen.getByText("Capitonat").tagName).toBe("DD");
    const dts = Array.from(dl!.querySelectorAll("dt")).map((el) => el.textContent);
    const dds = Array.from(dl!.querySelectorAll("dd")).map((el) => el.textContent);
    expect(dts).toEqual(["Model", "Saltea", "Material"]);
    expect(dds).toEqual(["Capitonat", "180 × 200 cm", "Catifea, verde sticlă"]);
  });

  it("switches row sizes and renders children under the rows", () => {
    const { container } = render(
      <Ticket title="Fișă de configurare" rows={ROWS} size="md">
        <p>Preț orientativ</p>
      </Ticket>,
    );
    expect(container.querySelector("dl")?.className).toContain("text-[13px]");
    expect(screen.getByText("Preț orientativ")).toBeInTheDocument();
  });
});
