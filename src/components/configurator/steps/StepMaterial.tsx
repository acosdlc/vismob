import type { Family, FamilyId, Model, Resolved } from "@/lib/configurator";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";

// DESIGN §4.2 step 03 and §3.10: family tabs (15px, active 600 with an inset 0 -2px accent
// underline, min-height 44px) filtered by model.families (§5.2); the 48×48 swatch buttons
// (aria-label = colour name, aria-pressed; selected: outline 2px ink, offset 3px); the row
// „{Familie} · {Culoare} [cod furnizor]” and the link to /materiale.

export const SUPPLIER_CODE_PLACEHOLDER = "[cod furnizor]";

export interface StepMaterialProps {
  model: Model;
  families: Family[];
  resolved: Pick<Resolved, "family" | "color">;
  onFamilyChange: (family: FamilyId) => void;
  onColorChange: (color: string) => void;
}

export function StepMaterial({ model, families, resolved, onFamilyChange, onColorChange }: StepMaterialProps) {
  const available = model.families
    .map((id) => families.find((f) => f.id === id))
    .filter((f): f is Family => Boolean(f));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-5 border-b border-rule" data-testid="family-tabs">
        {available.map((family) => {
          const selected = family.id === resolved.family.id;
          return (
            <button
              key={family.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onFamilyChange(family.id)}
              className={cx(
                "inline-flex min-h-11 items-center text-[15px] leading-[1.3] transition-[box-shadow] duration-150",
                selected ? "font-semibold shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-ink-2 hover:text-ink",
              )}
              data-family={family.id}
            >
              {family.name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-[10px]" data-testid="swatches">
        {resolved.family.colors.map((color) => {
          const selected = color.id === resolved.color.id;
          return (
            <button
              key={color.id}
              type="button"
              aria-label={color.name}
              aria-pressed={selected}
              title={color.name}
              onClick={() => onColorChange(color.id)}
              className={cx(
                "size-12 shrink-0 border border-[rgba(24,25,27,.25)] focus-visible:outline-accent focus-visible:outline-offset-2",
                `tex-${resolved.family.id}`,
                selected && "outline-2 outline-offset-[3px] outline-ink",
              )}
              style={{ backgroundColor: color.hex }}
              data-color={color.id}
            />
          );
        })}
      </div>

      <p className="text-[15px] leading-[1.5]">
        <strong className="font-semibold">{resolved.family.name}</strong> · {resolved.color.name}{" "}
        <span className="font-mono text-[12px] text-muted">{resolved.color.supplierCode ?? SUPPLIER_CODE_PLACEHOLDER}</span>
      </p>

      <Button variant="link" href="/materiale" className="self-start">
        Vezi toate materialele
      </Button>
    </div>
  );
}
