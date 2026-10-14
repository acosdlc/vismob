import type { Model, ModelId } from "@/lib/configurator/types";
import { cx } from "@/components/site/cx";
import { HeadboardIcon } from "../HeadboardIcon";

// DESIGN §4.2 step 01: 4 button-cards (aria-pressed) in a grid minmax(min(150px,100%),1fr),
// gap 10px; each with the 64×40 headboard icon, the name (16px 600) and the note (13px).

/** The grid of option cards (steps 01, 05, 06; §6: minimum 150). */
export const OPTION_GRID = "grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]";

/**
 * Button-card: selected = 2px accent border on white, unselected = 1px rule on card. The
 * second accent pixel is an inset shadow, so the card does not shift when selected.
 */
export function optionCardClasses(selected: boolean, className?: string): string {
  return cx(
    "flex min-h-11 flex-col items-start gap-2 rounded-ui border p-[14px] text-left transition-[border-color,background-color] duration-150",
    selected
      ? "border-accent bg-white shadow-[inset_0_0_0_1px_var(--color-accent)]"
      : "border-rule bg-card hover:border-field",
    className,
  );
}

export interface StepModelProps {
  models: Model[];
  value: ModelId;
  onChange: (model: ModelId) => void;
  idPrefix?: string;
}

export function StepModel({ models, value, onChange, idPrefix = "step-model" }: StepModelProps) {
  return (
    <div className={OPTION_GRID}>
      {models.map((model) => {
        const selected = model.id === value;
        return (
          <button
            key={model.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(model.id)}
            className={optionCardClasses(selected)}
            data-model={model.id}
          >
            <HeadboardIcon model={model.id} idPrefix={idPrefix} className="h-10 w-16" />
            <span className="flex flex-col gap-[2px]">
              <span className="text-[16px] leading-[1.3] font-semibold">{model.name}</span>
              <span className="text-[13px] leading-[1.4] text-ink-2">{model.note}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
