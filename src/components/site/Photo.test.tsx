import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Photo } from "./Photo";

const FRAME = "Pat finalizat, în dormitorul unui client. Lumină naturală, cadru orizontal, fără blitz.";

describe("Photo", () => {
  it("shows the FOTO label and the frame text when there is no src", () => {
    const { container } = render(<Photo alt="Pat capitonat" ratio="5:4" label="FOTO 01" frame={FRAME} />);
    expect(screen.getByText("FOTO 01")).toBeInTheDocument();
    expect(screen.getByText(FRAME)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    const box = container.querySelector(".photo-placeholder");
    expect(box).not.toBeNull();
    expect(box?.className).toContain("aspect-[5/4]");
  });

  it("renders next/image with the alt text when a src is given, and the caption below", () => {
    const { container } = render(
      <Photo src="/foto/01.jpg" alt="Pat capitonat" ratio="4:3" sizes="50vw" caption="Capitonat · 160 × 200 · Catifea, verde sticlă · Cluj" />,
    );
    const img = screen.getByRole("img", { name: "Pat capitonat" });
    expect(img).toHaveAttribute("sizes", "50vw");
    expect(container.querySelector("figcaption")).toHaveTextContent("Capitonat · 160 × 200 · Catifea, verde sticlă · Cluj");
    expect(screen.queryByText("FOTO 01")).toBeNull();
  });
});
