import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { formatPrice } from "@/lib/configurator/format";
import type { Pricing } from "@/lib/configurator/pricing";
import { PREVIEW_CONFIGS, PRICING_MESSAGES, PRICING_WIDTHS, previewPrices } from "@/lib/configurator/pricing-schema";
import type { Catalog } from "@/lib/configurator/types";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const savePricing = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-pricing", () => ({
  savePricing: (...args: [AdminActionState, FormData]) => savePricing(...args),
}));

import { PricingForm } from "./PricingForm";

/** Stands where the framework's boundaries are; React reports what it catches to `onCaughtError`. */
class Boundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };

  static getDerivedStateFromError() {
    return { caught: true };
  }

  render() {
    return this.state.caught ? null : this.props.children;
  }
}

/** What a Server Action's `redirect()` reaches the browser as: the call rejects with it. */
function redirectTo(path: string): unknown {
  try {
    return redirect(path);
  } catch (error) {
    return error;
  }
}

// A fixture only (the style of src/lib/configurator/pricing.test.ts): never a real price.
const PRICING: Pricing = {
  grid: {
    capitonat: { "90": 2000, "120": 2400, "140": 2800, "160": 3000, "180": 3400, "200": 3800 },
    arcuit: { "160": 3200, "180": 3600 },
    canale: { "160": 3300 },
    lamele: {},
  },
  categoryPct: { A: 0, B: 10, C: 20 },
  hbPct: { "100": 0, "120": 5, "140": 10 },
  base: { lemn: 0, metal: 100, lada: 800, sertare: 600 },
  extras: { led: 300, nightstands: 1200 },
  customPct: 15,
  roundTo: 50,
};

const LABELS = {
  categories: ["Categoria A", "Categoria B", "Categoria C"],
  heights: ["100 cm", "120 cm", "140 cm"],
  bases: SEED_CATALOG.bases.map((base) => base.name),
  extras: ["LED sub pat", "2 noptiere"],
  other: ["Adaos pentru dimensiune nestandard (%)", "Rotunjire (lei)"],
};

const SECTIONS = [
  "Preț de bază pe lățime (lei)",
  "Adaos pe categoria materialului (%)",
  "Adaos pe înălțimea tăbliei (%)",
  "Picioare și baze (lei)",
  "Extra (lei)",
  "Alte reguli",
  "Previzualizare",
];

/** The preview table's price column, in row order (the preview is the last table on the screen). */
function previewCells(): string[] {
  const table = screen.getAllByRole("table").at(-1)!;
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1].textContent ?? "");
}

const shown = (price: number | null) => (price === null ? "—" : formatPrice(price));

beforeEach(() => {
  savePricing.mockReset();
  savePricing.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
});

describe("PricingForm", () => {
  it("renders the seven sections, a cell per model × width and every other field, prefilled from the grid", () => {
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);

    for (const title of SECTIONS) expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();

    const grid = screen.getAllByRole("table")[0];
    const headers = within(grid).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["cm", ...PRICING_WIDTHS]);
    for (const model of SEED_CATALOG.models) {
      expect(within(grid).getByText(model.name)).toBeInTheDocument();
      expect(within(grid).getByText(model.code)).toBeInTheDocument();
      for (const width of PRICING_WIDTHS) {
        const cell = screen.getByLabelText(`${model.name}, ${width} cm`);
        expect(cell).toHaveAttribute("name", `grid.${model.id}.${width}`);
        expect(cell).toHaveAttribute("type", "text");
        expect(cell).toHaveAttribute("inputmode", "decimal");
        expect(cell).toHaveAccessibleDescription(PRICING_MESSAGES.grid);
        const price = PRICING.grid[model.id][width];
        expect(cell).toHaveValue(price === undefined ? "" : String(price));
        expect(cell).not.toHaveAttribute("aria-invalid");
      }
    }

    const expectField = (label: string, name: string, value: number) => {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute("name", name);
      expect(control).toHaveAttribute("inputmode", "decimal");
      expect(control).toHaveValue(String(value));
      expect(control).not.toHaveAttribute("aria-invalid");
    };
    expectField("Categoria A", "categoryPct.A", 0);
    expectField("Categoria B", "categoryPct.B", 10);
    expectField("Categoria C", "categoryPct.C", 20);
    expectField("100 cm", "hbPct.100", 0);
    expectField("120 cm", "hbPct.120", 5);
    expectField("140 cm", "hbPct.140", 10);
    for (const base of SEED_CATALOG.bases) expectField(base.name, `base.${base.id}`, PRICING.base[base.id]);
    expectField("LED sub pat", "extras.led", 300);
    expectField("2 noptiere", "extras.nightstands", 1200);
    expectField("Adaos pentru dimensiune nestandard (%)", "customPct", 15);
    expectField("Rotunjire (lei)", "roundTo", 50);
    expect(screen.getByLabelText("Rotunjire (lei)")).toHaveAccessibleDescription(
      "Prețul se rotunjește la acest pas, de exemplu 50.",
    );

    const submit = screen.getByRole("button", { name: "Salvează" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).not.toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts empty without a grid and says the preview waits for the fields", () => {
    render(<PricingForm pricing={null} catalog={SEED_CATALOG} />);
    for (const label of [...LABELS.categories, ...LABELS.heights, ...LABELS.bases, ...LABELS.extras, ...LABELS.other]) {
      expect(screen.getByLabelText(label)).toHaveValue("");
    }
    expect(screen.getByLabelText("Capitonat, 160 cm")).toHaveValue("");
    expect(previewCells()).toEqual(["—", "—", "—"]);
    expect(screen.getByText("Completează toate câmpurile cu numere valide ca să vezi prețurile.")).toBeInTheDocument();
  });

  it("previews the three typical configurations from the grid and follows every change", () => {
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);

    const expected = previewPrices(SEED_CATALOG, PRICING);
    expect(expected.map((p) => p.price)).toEqual([3150, 5050, null]);
    for (const row of expected) expect(screen.getByText(row.label)).toBeInTheDocument();
    expect(previewCells()).toEqual(expected.map((p) => shown(p.price)));
    expect(screen.queryByText("Completează toate câmpurile cu numere valide ca să vezi prețurile.")).toBeNull();

    // Capitonat 160 → 4000: 4000 × 1.05 = 4200. Lamele 140 → 2500: 2500 + metal 100 = 2600.
    fireEvent.change(screen.getByLabelText("Capitonat, 160 cm"), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("Lamele, 140 cm"), { target: { value: "2500" } });
    expect(previewCells()).toEqual([shown(4200), shown(5050), shown(2600)]);

    // An invalid form keeps the last valid preview and says so; valid again, the line goes.
    fireEvent.change(screen.getByLabelText("Rotunjire (lei)"), { target: { value: "" } });
    expect(previewCells()).toEqual([shown(4200), shown(5050), shown(2600)]);
    expect(screen.getByText("Completează toate câmpurile cu numere valide ca să vezi prețurile.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rotunjire (lei)"), { target: { value: "100" } });
    expect(screen.queryByText("Completează toate câmpurile cu numere valide ca să vezi prețurile.")).toBeNull();
    expect(previewCells()).toEqual([shown(4200), shown(5100), shown(2600)]);
  });

  it("prices the preview with the catalogue's own colour categories", () => {
    const catalog: Catalog = {
      ...SEED_CATALOG,
      families: SEED_CATALOG.families.map((family) =>
        family.id === "catifea" ? { ...family, colors: family.colors.map((c) => ({ ...c, priceCategory: "C" as const })) } : family,
      ),
    };
    render(<PricingForm pricing={PRICING} catalog={catalog} />);
    // 3000 × (1 + (20 + 5) / 100) = 3750
    expect(previewCells()[0]).toBe(shown(3750));
    expect(PREVIEW_CONFIGS[0].label).toContain("Capitonat 160 × 200");
  });

  it("keeps a row for a model and a base the public catalogue leaves out, named from the seed", () => {
    const catalog: Catalog = {
      ...SEED_CATALOG,
      models: SEED_CATALOG.models.filter((m) => m.id !== "canale"),
      bases: SEED_CATALOG.bases.filter((b) => b.id !== "sertare"),
    };
    render(<PricingForm pricing={PRICING} catalog={catalog} />);
    expect(screen.getByLabelText("Canale, 160 cm")).toHaveValue("3300");
    expect(screen.getByLabelText("Sertare")).toHaveValue("600");
  });

  it("submits every field to the action and shows the saved notice, keeping the typed values", async () => {
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);
    fireEvent.change(screen.getByLabelText("Arcuit, 200 cm"), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("Categoria B"), { target: { value: "12.5" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(savePricing).toHaveBeenCalledTimes(1));
    const formData = savePricing.mock.calls[0][1];
    expect(formData.get("grid.arcuit.200")).toBe("4000");
    expect(formData.get("grid.arcuit.160")).toBe("3200");
    expect(formData.get("grid.lamele.90")).toBe("");
    expect(formData.get("categoryPct.B")).toBe("12.5");
    expect(formData.get("hbPct.140")).toBe("10");
    expect(formData.get("base.lada")).toBe("800");
    expect(formData.get("extras.led")).toBe("300");
    expect(formData.get("extras.nightstands")).toBe("1200");
    expect(formData.get("customPct")).toBe("15");
    expect(formData.get("roundTo")).toBe("50");
    expect([...formData.keys()].filter((k) => !k.startsWith("$ACTION"))).toHaveLength(4 * 6 + 3 + 3 + 4 + 2 + 2);

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(screen.getByLabelText("Arcuit, 200 cm")).toHaveValue("4000");
    expect(screen.getByLabelText("Categoria B")).toHaveValue("12.5");
    expect(screen.getByRole("button", { name: "Salvează" })).not.toBeDisabled();
  });

  it("hides the saved notice as soon as a price is edited after a save, the preview still following, and shows it again after the next save", async () => {
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");

    // Capitonat 160 → 4000: the preview follows (4000 × 1.05 = 4200) and the bar no longer says „Salvat.”.
    fireEvent.change(screen.getByLabelText("Capitonat, 160 cm"), { target: { value: "4000" } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(previewCells()[0]).toBe(shown(4200));
    expect(screen.getByLabelText("Capitonat, 160 cm")).toHaveValue("4000");

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(savePricing.mock.calls[1][1].get("grid.capitonat.160")).toBe("4000");

    // A field outside the grid hides it too; saved with nothing changed in between, the
    // notice goes while the save runs and is back with its answer.
    fireEvent.change(screen.getByLabelText("Categoria B"), { target: { value: "12.5" } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
  });

  it("keeps the error notice and the field errors while the form is edited", async () => {
    savePricing.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { roundTo: PRICING_MESSAGES.number },
    });
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("alert");
    const roundTo = screen.getByLabelText("Rotunjire (lei)");
    await waitFor(() => expect(document.activeElement).toBe(roundTo));

    const cell = screen.getByLabelText("Capitonat, 160 cm");
    cell.focus();
    fireEvent.change(cell, { target: { value: "4000" } });

    expect(screen.getByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(roundTo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(PRICING_MESSAGES.number)).toBeInTheDocument();
    expect(document.activeElement).toBe(cell);
    expect(previewCells()[0]).toBe(shown(4200));
  });

  it("shows the server's message and field errors, and focuses the first invalid field in form order", async () => {
    savePricing.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { roundTo: PRICING_MESSAGES.number, "grid.arcuit.180": PRICING_MESSAGES.positive },
    });
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");

    const cell = screen.getByLabelText("Arcuit, 180 cm");
    expect(cell).toHaveAttribute("aria-invalid", "true");
    expect(cell.className).toContain("border-error");
    expect(cell).toHaveAccessibleDescription(`${PRICING_MESSAGES.grid} ${PRICING_MESSAGES.positive}`);
    const roundTo = screen.getByLabelText("Rotunjire (lei)");
    expect(roundTo).toHaveAttribute("aria-invalid", "true");
    expect(roundTo).toHaveAccessibleDescription(`Prețul se rotunjește la acest pas, de exemplu 50. ${PRICING_MESSAGES.number}`);
    expect(screen.getByLabelText("Arcuit, 160 cm")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Categoria A")).not.toHaveAttribute("aria-invalid");
    // The grid comes before „Alte reguli” in the form order.
    await waitFor(() => expect(document.activeElement).toBe(cell));
  });

  it("shows a plain error without field errors", async () => {
    savePricing.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText("Capitonat, 160 cm")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Rotunjire (lei)")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps the form and every typed price when the call to the action fails, and saves on the next try", async () => {
    // No answer comes back: here a dropped connection (a laptop just back from sleep gives the same),
    // which the next try can get past. After a deployment that retired the action's id only a reload helps.
    savePricing.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<PricingForm pricing={PRICING} catalog={SEED_CATALOG} />);
    const cell = screen.getByLabelText("Capitonat, 160 cm");
    fireEvent.change(cell, { target: { value: "4000" } });
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    // Not „Nu am putut salva…”, the server's word for a write that failed: this one may have gone through.
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
    expect(alert.className).toContain("border-error");
    // The same input, not a fresh one with the saved price: the form was never taken down.
    expect(screen.getByLabelText("Capitonat, 160 cm")).toBe(cell);
    expect(cell).toHaveValue("4000");
    expect(previewCells()[0]).toBe(shown(4200));
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(savePricing.mock.calls[1][1].get("grid.capitonat.160")).toBe("4000");
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    const thrown = redirectTo("/admin/preturi");
    savePricing.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <PricingForm pricing={PRICING} catalog={SEED_CATALOG} />
      </Boundary>,
      { onCaughtError: caught },
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(ADMIN_MESSAGES.noAnswer)).toBeNull();
  });
});
