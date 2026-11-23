import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { resolve } from "@/lib/configurator/rules";
import type { Catalog, Config } from "@/lib/configurator/types";
import { StepMaterial } from "./StepMaterial";

// The seed with a supplier code on its default colour (ct-verde); every other colour has none,
// as a colour saved in the panel with „Cod furnizor” left empty.
const CATALOG: Catalog = {
  ...SEED_CATALOG,
  families: SEED_CATALOG.families.map((family) => ({
    ...family,
    colors: family.colors.map((color) => (color.id === "ct-verde" ? { ...color, supplierCode: "VL-204" } : color)),
  })),
};

/** Renders the step for a configuration and returns the row under the swatches. */
function renderRow(patch: Partial<Config> = {}) {
  const resolved = resolve({ ...DEFAULT_CONFIG, ...patch }, CATALOG);
  render(
    <StepMaterial
      model={resolved.model}
      families={CATALOG.families}
      resolved={resolved}
      onFamilyChange={() => undefined}
      onColorChange={() => undefined}
    />,
  );
  return screen.getByText(resolved.family.name, { selector: "strong" }).parentElement;
}

describe("StepMaterial", () => {
  it("prints the supplier's code after the colour's name when the colour has one", () => {
    expect(renderRow()).toHaveTextContent(/^Catifea · Verde sticlă VL-204$/);
    expect(screen.getByText("VL-204")).toHaveClass("font-mono");
  });

  it("ends the row after the colour's name when the colour has no supplier code", () => {
    expect(renderRow({ color: "ct-bleumarin" })).toHaveTextContent(/^Catifea · Bleumarin$/);
    expect(screen.queryByText("[cod furnizor]")).not.toBeInTheDocument();
  });
});
