import { useId } from "react";
import type { Config } from "@/lib/configurator/types";
import { Checkbox } from "@/components/site/form";
import { OPTION_GRID } from "./StepModel";

// DESIGN §4.2 step 06: 2 card checkboxes (real <input type="checkbox"> + label; padding 14px,
// border 1px rule, card background) with the title (16px 600) and the note (13px). The
// titles are DESIGN's; the notes are the defaults settled in docs/PLAN.md (decisions table).

export const EXTRAS = [
  { key: "led", title: "LED sub pat", note: "Bandă de lumină discretă, sub cadru." },
  { key: "nightstands", title: "2 noptiere", note: "Asortate cu patul, în același material." },
] as const;

export interface StepExtrasProps {
  value: Pick<Config, "led" | "nightstands">;
  onChange: (patch: Partial<Pick<Config, "led" | "nightstands">>) => void;
}

export function StepExtras({ value, onChange }: StepExtrasProps) {
  const id = useId();
  return (
    <div className={OPTION_GRID}>
      {EXTRAS.map((extra) => (
        <Checkbox
          key={extra.key}
          id={`${id}-${extra.key}`}
          name={extra.key}
          checked={value[extra.key]}
          onChange={(e) => onChange({ [extra.key]: e.target.checked })}
          labelClassName="rounded-ui border border-rule bg-card p-[14px]"
        >
          <span className="flex flex-col gap-[2px]">
            <span className="text-[16px] leading-[1.3] font-semibold">{extra.title}</span>
            <span className="text-[13px] leading-[1.4] text-ink-2">{extra.note}</span>
          </span>
        </Checkbox>
      ))}
    </div>
  );
}
