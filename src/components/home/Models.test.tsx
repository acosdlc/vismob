import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { Catalog, ModelId } from "@/lib/configurator/types";
import { Models } from "./Models";

/** The seed catalogue with the card text of one model set, as the panel's „Descriere” stores it. */
function withDescription(id: ModelId, description: string): Catalog {
  return { ...SEED_CATALOG, models: SEED_CATALOG.models.map((m) => (m.id === id ? { ...m, description } : m)) };
}

/** The description paragraph of a model's card: the first paragraph under its heading. */
function cardText(name: string): HTMLParagraphElement | null {
  return screen.getByRole("heading", { level: 3, name }).closest("li")?.querySelector("p") ?? null;
}

describe("Models", () => {
  it("prints the model's own card text, and the DESIGN text for a model that has none", () => {
    render(<Models catalog={withDescription("arcuit", "Linie curbă.")} showPrices={false} />);
    expect(cardText("Arcuit")).toHaveTextContent("Linie curbă.");
    expect(cardText("Capitonat")).toHaveTextContent(
      "Tăblie tapițată, cu nasturi îmbrăcați în același material. Clasic, merge în orice cameră.",
    );
  });

  it("keeps the line breaks of a card text typed on several lines", () => {
    const description = "Linie curbă, tapițerie netedă.\nBordură cusută.";
    render(<Models catalog={withDescription("arcuit", description)} showPrices={false} />);
    const paragraph = cardText("Arcuit");
    // The text is printed as stored; pre-line is what makes the browser break the lines.
    expect(paragraph?.textContent).toBe(description);
    expect(paragraph?.className).toContain("whitespace-pre-line");
  });
});
