import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";

// The page's readers, replaced: each test sets the settings and the starting prices.
const mocks = vi.hoisted(() => ({ getSettings: vi.fn(), getStartingPrices: vi.fn() }));
vi.mock("@/lib/data/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/data/catalog", () => ({ getCatalog: async () => SEED_CATALOG }));
vi.mock("@/lib/data/projects", () => ({ getHeroProject: async () => null, getProjects: async () => [] }));
vi.mock("@/lib/data/reviews", () => ({ getReviews: async () => [] }));
vi.mock("@/lib/data/pricing", () => ({ getStartingPrices: mocks.getStartingPrices }));
// The request form brings its Server Actions; the page only places it.
vi.mock("@/components/contact/ContactForm", () => ({ ContactForm: () => null }));

import Home from "@/app/(site)/page";

const QUESTION = "Cât costă un pat la comandă?";

beforeEach(() => {
  mocks.getSettings.mockReset();
  mocks.getStartingPrices.mockReset();
});

describe("Acasă: the price question of 08 — Întrebări", () => {
  it("shows the lowest of the model cards' starting prices when prices are public", async () => {
    mocks.getSettings.mockResolvedValue({ ...SEED_SETTINGS, show_prices: true });
    mocks.getStartingPrices.mockResolvedValue({ capitonat: 3000, arcuit: 3200, canale: 2950 });
    render(await Home());
    const question = screen.getByText(QUESTION);
    expect(question.closest("details")).toHaveTextContent(
      "Depinde de model, dimensiune și material. Un pat de 160 × 200 cm pornește de la 2.950 lei. Prețul final îl primești în scris, după ce stabilim toate detaliile.",
    );
    // It is the first question of the list (DESIGN §4.1).
    expect(question.closest("ul")?.querySelector("summary")).toHaveTextContent(QUESTION);
    // The cards keep their own prices.
    expect(screen.getByText("de la 3.000 lei · 160 × 200")).toBeInTheDocument();
  });

  it("stays hidden when prices are public but no model has a starting price", async () => {
    mocks.getSettings.mockResolvedValue({ ...SEED_SETTINGS, show_prices: true });
    mocks.getStartingPrices.mockResolvedValue({});
    render(await Home());
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    expect(screen.getByText("Cât durează?")).toBeInTheDocument();
  });

  it("does not read the price grid while prices are not public", async () => {
    mocks.getSettings.mockResolvedValue({ ...SEED_SETTINGS, show_prices: false });
    mocks.getStartingPrices.mockResolvedValue({ capitonat: 3000 });
    render(await Home());
    expect(mocks.getStartingPrices).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    expect(screen.queryByText(/de la .* lei/)).not.toBeInTheDocument();
  });
});
