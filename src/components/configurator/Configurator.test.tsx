import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { caption } from "@/lib/configurator/format";
import type { Resolved } from "@/lib/configurator/rules";
import type { Pricing } from "@/lib/configurator/pricing";
import type { ConfiguratorSettings, QuoteSectionProps } from "./types";

// The URL the mocked useSearchParams reports; set per test before rendering.
const url = { query: "" };
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(url.query),
}));

// The other builders' components, reduced to what this root passes them.
vi.mock("@/components/drawings/DrawingFigure", () => ({
  DrawingFigure: ({ resolved }: { resolved: Resolved }) => (
    <figure data-testid="drawing-figure">
      <figcaption>{caption(resolved)}</figcaption>
    </figure>
  ),
}));
vi.mock("@/components/drawings/BedDrawing", () => ({
  BedDrawing: ({ resolved }: { resolved: Resolved }) => <svg data-testid="bed-drawing" data-model={resolved.model.id} />,
}));
vi.mock("@/components/configurator/QuoteSection", () => ({
  QuoteSection: ({ code, responseTime }: QuoteSectionProps) => (
    <section id="cerere" data-testid="quote-section" data-response-time={responseTime}>
      {code}
    </section>
  ),
}));

import { Configurator } from "./Configurator";

const SETTINGS: ConfiguratorSettings = { show_prices: false, whatsapp_number: "", response_time: "[24 de ore]" };

const PRICING: Pricing = {
  grid: { capitonat: { "90": 3000, "160": 4000 }, arcuit: { "160": 4500 }, canale: { "160": 4200 }, lamele: { "160": 3800 } },
  categoryPct: { A: 0, B: 10, C: 20 },
  hbPct: { "100": 0, "120": 5, "140": 10 },
  base: { lemn: 0, metal: 100, lada: 600, sertare: 500 },
  extras: { led: 250, nightstands: 900 },
  customPct: 15,
  roundTo: 50,
};

function renderConfigurator(settings: Partial<ConfiguratorSettings> = {}, pricing: Pricing | null = null) {
  return render(<Configurator catalog={SEED_CATALOG} settings={{ ...SETTINGS, ...settings }} pricing={pricing} />);
}

const code = () => screen.getByTestId("ticket-code").textContent;
const pressed = (name: RegExp | string) => screen.getByRole("button", { name });

let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  url.query = "";
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
});
afterEach(() => {
  replaceState.mockRestore();
});

describe("Configurator", () => {
  it("renders the six steps as fieldsets with legends, the figure, the ticket and the quote section", () => {
    renderConfigurator();
    const legends = screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent);
    expect(legends).toEqual([
      "01Model",
      "02Dimensiunea saltelei",
      "03Material și culoare",
      "04Înălțimea tăbliei",
      "05Baza patului",
      "06Extra",
    ]);
    expect(screen.getByTestId("drawing-figure")).toBeInTheDocument();
    expect(screen.getByText("Fișă de configurare")).toBeInTheDocument();
    expect(code()).toBe("CAP-160x200-CT01-H120-PL");
    expect(screen.getByTestId("ticket-code")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("quote-section")).toHaveTextContent("CAP-160x200-CT01-H120-PL");
    expect(screen.getByTestId("quote-section")).toHaveAttribute("data-response-time", "[24 de ore]");
    expect(screen.getByRole("link", { name: "Cere ofertă pentru acest pat" })).toHaveAttribute("href", "#cerere");
  });

  it("every step exposes aria-pressed and the pressed option follows the state", () => {
    renderConfigurator();
    expect(pressed(/^Capitonat/)).toHaveAttribute("aria-pressed", "true");
    expect(pressed(/^Arcuit/)).toHaveAttribute("aria-pressed", "false");
    expect(pressed("160 × 200")).toHaveAttribute("aria-pressed", "true");
    expect(pressed("Catifea")).toHaveAttribute("aria-pressed", "true");
    expect(pressed("Verde sticlă")).toHaveAttribute("aria-pressed", "true");
    expect(pressed("Bleumarin")).toHaveAttribute("aria-pressed", "false");
    expect(pressed("120 cm")).toHaveAttribute("aria-pressed", "true");
    expect(pressed(/^Picioare din lemn/)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(pressed("140 cm"));
    expect(pressed("140 cm")).toHaveAttribute("aria-pressed", "true");
    expect(pressed("120 cm")).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pressed(/^Ladă de depozitare/));
    expect(pressed(/^Ladă de depozitare/)).toHaveAttribute("aria-pressed", "true");
    expect(pressed(/^Picioare din lemn/)).toHaveAttribute("aria-pressed", "false");
    expect(code()).toBe("CAP-160x200-CT01-H140-LD");

    const led = screen.getByRole("checkbox", { name: /LED sub pat/ });
    fireEvent.click(led);
    expect(led).toBeChecked();
    expect(code()).toBe("CAP-160x200-CT01-H140-LD-LED");
  });

  it("updates the code and the URL when the model changes", () => {
    renderConfigurator();
    fireEvent.click(pressed(/^Arcuit/));
    expect(code()).toBe("ARC-160x200-CT01-H120-PL");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "?m=arcuit&s=160&f=catifea&c=ct-verde&h=120&b=lemn");
    expect(screen.getByTestId("quote-section")).toHaveTextContent("ARC-160x200-CT01-H120-PL");
  });

  it("choosing Lamele resets the family to lemn and the colour to lm-stejar", () => {
    renderConfigurator();
    fireEvent.click(pressed(/^Lamele/));
    expect(code()).toBe("LAM-160x200-LM01-H120-PL");
    const tabs = within(screen.getByTestId("family-tabs")).getAllByRole("button");
    expect(tabs.map((t) => t.textContent)).toEqual(["Lemn masiv"]);
    expect(pressed("Lemn masiv")).toHaveAttribute("aria-pressed", "true");
    expect(pressed("Stejar natur")).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "?m=lamele&s=160&f=lemn&c=lm-stejar&h=120&b=lemn");
    expect(screen.getByText("Lemn masiv", { selector: "strong" })).toBeInTheDocument();
  });

  it("choosing a family resets the colour to its first", () => {
    renderConfigurator();
    fireEvent.click(pressed("Muștar"));
    expect(code()).toBe("CAP-160x200-CT03-H120-PL");
    fireEvent.click(pressed("Bouclé"));
    expect(code()).toBe("CAP-160x200-BC01-H120-PL");
    expect(pressed("Alb lapte")).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "?m=capitonat&s=160&f=boucle&c=bc-alb&h=120&b=lemn");
    expect(screen.getByText("[cod furnizor]")).toBeInTheDocument();
  });

  it("„Altă dimensiune” reveals the two inputs and the code shows the custom size", () => {
    renderConfigurator();
    expect(screen.queryByLabelText("Lățime saltea (cm)")).toBeNull();
    fireEvent.click(pressed("Altă dimensiune"));
    const w = screen.getByLabelText("Lățime saltea (cm)");
    const l = screen.getByLabelText("Lungime saltea (cm)");
    expect(w).toHaveAttribute("min", "80");
    expect(w).toHaveAttribute("max", "220");
    expect(l).toHaveAttribute("min", "180");
    expect(l).toHaveAttribute("max", "220");
    expect(code()).toBe("CAP-150x200-CT01-H120-PL");

    fireEvent.change(w, { target: { value: "135" } });
    fireEvent.change(l, { target: { value: "210" } });
    expect(code()).toBe("CAP-135x210-CT01-H120-PL");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "?m=capitonat&s=custom&f=catifea&c=ct-verde&h=120&b=lemn&w=135&l=210");
    // Out of range is clamped by resolve() in the code; the input keeps what was typed.
    fireEvent.change(w, { target: { value: "300" } });
    expect(code()).toBe("CAP-220x210-CT01-H120-PL");
    expect(w).toHaveValue(300);
  });

  it("hides the WhatsApp button without a number and shows it with one", () => {
    const { unmount } = renderConfigurator();
    expect(screen.queryByRole("link", { name: "Trimite pe WhatsApp" })).toBeNull();
    unmount();

    renderConfigurator({ whatsapp_number: "+40 722 123 456" });
    const wa = screen.getByRole("link", { name: "Trimite pe WhatsApp" });
    const href = wa.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/40722123456?text=")).toBe(true);
    const text = decodeURIComponent(href.split("?text=")[1] ?? "");
    expect(text).toContain("(CAP-160x200-CT01-H120-PL)");
    expect(text).toContain(`${window.location.origin}/configurator?m=capitonat&s=160&f=catifea&c=ct-verde&h=120&b=lemn`);
  });

  it("initialises from ?m=lamele&c=lm-nuc", () => {
    url.query = "m=lamele&c=lm-nuc";
    renderConfigurator();
    expect(pressed(/^Lamele/)).toHaveAttribute("aria-pressed", "true");
    expect(pressed("Nuc")).toHaveAttribute("aria-pressed", "true");
    expect(code()).toBe("LAM-160x200-LM03-H120-PL");
    expect(screen.getByRole("figure")).toHaveTextContent("Lamele · lemn masiv, nuc");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("follows the URL when it changes from outside, but not its own replaceState echo", () => {
    const view = renderConfigurator();
    fireEvent.click(pressed(/^Arcuit/));
    // Next reports the written query back through useSearchParams: nothing changes.
    url.query = "m=arcuit&s=160&f=catifea&c=ct-verde&h=120&b=lemn";
    view.rerender(<Configurator catalog={SEED_CATALOG} settings={SETTINGS} pricing={null} />);
    expect(code()).toBe("ARC-160x200-CT01-H120-PL");
    fireEvent.click(pressed("140 cm"));
    expect(code()).toBe("ARC-160x200-CT01-H140-PL");
    // A navigation to another configuration (e.g. a model card link) replaces the state.
    url.query = "m=lamele&c=lm-nuc";
    view.rerender(<Configurator catalog={SEED_CATALOG} settings={SETTINGS} pricing={null} />);
    expect(code()).toBe("LAM-160x200-LM03-H120-PL");
    expect(pressed(/^Lamele/)).toHaveAttribute("aria-pressed", "true");
  });

  it("lands on Lamele with its first colour from ?m=lamele", () => {
    url.query = "m=lamele";
    renderConfigurator();
    expect(code()).toBe("LAM-160x200-LM01-H120-PL");
  });

  it("shows only the hidden-price note while show_prices is off, and the price when on", () => {
    const { unmount } = renderConfigurator({ show_prices: false }, PRICING);
    expect(screen.queryByText("Preț orientativ")).toBeNull();
    expect(screen.getByText("Prețul final îl confirmăm în scris, după o discuție scurtă.")).toBeInTheDocument();
    unmount();

    renderConfigurator({ show_prices: true }, PRICING);
    expect(screen.getByText("Preț orientativ")).toBeInTheDocument();
    // 4000 × 1.05 = 4200, + base 0 → 4.200 lei
    expect(screen.getByTestId("price")).toHaveTextContent("4.200 lei");
    expect(screen.getByText(/Calculat din grila atelierului/)).toBeInTheDocument();
  });

  it("the headboard note and the materials link are present", () => {
    renderConfigurator();
    expect(screen.getByText("Măsurată de la podea. Peste 120 cm arată bine în camere cu tavan înalt.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vezi materialele și cere mostre" })).toHaveAttribute("href", "/materiale");
  });
});
