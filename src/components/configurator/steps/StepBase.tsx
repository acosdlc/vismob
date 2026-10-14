import type { Base, BaseId } from "@/lib/configurator/types";
import { OPTION_GRID, optionCardClasses } from "./StepModel";

// DESIGN §4.2 step 05: 4 button-cards like step 01, without the icon: title + note.

export interface StepBaseProps {
  bases: Base[];
  value: BaseId;
  onChange: (base: BaseId) => void;
}

export function StepBase({ bases, value, onChange }: StepBaseProps) {
  return (
    <div className={OPTION_GRID}>
      {bases.map((base) => {
        const selected = base.id === value;
        return (
          <button
            key={base.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(base.id)}
            className={optionCardClasses(selected)}
            data-base={base.id}
          >
            <span className="text-[16px] leading-[1.3] font-semibold">{base.name}</span>
            <span className="text-[13px] leading-[1.4] text-ink-2">{base.note}</span>
          </button>
        );
      })}
    </div>
  );
}
