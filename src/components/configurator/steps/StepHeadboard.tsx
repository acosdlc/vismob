import { HEIGHTS } from "@/lib/configurator/catalog.seed";
import type { HeadboardHeight } from "@/lib/configurator/types";
import { cx } from "@/components/site/cx";

// DESIGN §4.2 step 04: a segmented control (border 1.5px ink) with three equal buttons
// „100 cm” / „120 cm” / „140 cm” (aria-pressed; selected = ink background) and the note.

export const HEADBOARD_NOTE = "Măsurată de la podea. Peste 120 cm arată bine în camere cu tavan înalt.";

export interface StepHeadboardProps {
  value: HeadboardHeight;
  onChange: (hb: HeadboardHeight) => void;
}

export function StepHeadboard({ value, onChange }: StepHeadboardProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid max-w-[420px] grid-cols-3 divide-x-[1.5px] divide-ink overflow-hidden rounded-ui border-[1.5px] border-ink">
        {HEIGHTS.map((hb) => {
          const selected = hb === value;
          return (
            <button
              key={hb}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(hb)}
              className={cx(
                "min-h-11 px-3 font-mono text-[14px] leading-[1.2] transition-[background-color,color] duration-150",
                selected ? "bg-ink text-white" : "bg-transparent text-ink hover:bg-paper-2",
              )}
              data-hb={hb}
            >
              {hb} cm
            </button>
          );
        })}
      </div>
      <p className="text-[14px] leading-[1.5] text-ink-2">{HEADBOARD_NOTE}</p>
    </div>
  );
}
