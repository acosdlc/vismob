import { useId } from "react";
import { CUSTOM_L, CUSTOM_W, SIZES } from "@/lib/configurator/catalog.seed";
import type { Config, SizeKey } from "@/lib/configurator/types";
import { cx } from "@/components/site/cx";
import { Field, Input, Label } from "@/components/site/form";

// DESIGN §4.2 step 02: pills in DM Mono 14px, min-height 44px, border 1.5px ink, radius 2px;
// selected = ink background, white text. „Altă dimensiune” reveals the two number inputs
// (80–220 and 180–220); the clamping itself is resolve()'s job (§5.2).

export const CUSTOM_LABEL = "Altă dimensiune";

export function pillClasses(selected: boolean): string {
  return cx(
    "inline-flex min-h-11 items-center justify-center rounded-ui border-[1.5px] border-ink px-[14px] font-mono text-[14px] leading-[1.2] transition-[background-color,color] duration-150",
    selected ? "bg-ink text-white" : "bg-transparent text-ink hover:bg-paper-2",
  );
}

export interface StepSizeProps {
  /** `resolved.cfg`: the size key plus the raw custom values the inputs edit. */
  config: Pick<Config, "size" | "customW" | "customL">;
  onChange: (patch: Partial<Pick<Config, "size" | "customW" | "customL">>) => void;
}

export function StepSize({ config, onChange }: StepSizeProps) {
  const id = useId();
  const custom = config.size === "custom";
  const options: { key: SizeKey; label: string }[] = [
    ...SIZES.map((s) => ({ key: s as SizeKey, label: `${s} × 200` })),
    { key: "custom", label: CUSTOM_LABEL },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-[10px]">
        {options.map((option) => {
          const selected = option.key === config.size;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ size: option.key })}
              className={pillClasses(selected)}
              data-size={option.key}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {custom && (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
          <Field>
            <Label htmlFor={`${id}-w`}>Lățime saltea (cm)</Label>
            <Input
              id={`${id}-w`}
              type="number"
              inputMode="numeric"
              min={CUSTOM_W.min}
              max={CUSTOM_W.max}
              step={1}
              value={config.customW || ""}
              onChange={(e) => onChange({ customW: Number(e.target.value) })}
            />
          </Field>
          <Field>
            <Label htmlFor={`${id}-l`}>Lungime saltea (cm)</Label>
            <Input
              id={`${id}-l`}
              type="number"
              inputMode="numeric"
              min={CUSTOM_L.min}
              max={CUSTOM_L.max}
              step={1}
              value={config.customL || ""}
              onChange={(e) => onChange({ customL: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
