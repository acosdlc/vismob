import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";

export interface FormCardBar {
  /** Left text, e.g. „Cerere de ofertă”. */
  left: ReactNode;
  /** Right text, e.g. „Răspuns în [24h]”. */
  right?: ReactNode;
}

export interface FormCardProps extends ComponentProps<"div"> {
  /** Optional top bar (DESIGN §4.1): DM Mono 12px uppercase, border-bottom `rule`. */
  bar?: FormCardBar;
}

/** The vertical stack of a form (DESIGN §3.16: gap 18px); reuse it on the `<form>` inside the card. */
export const formStackClasses = "flex flex-col gap-[18px]";

// DESIGN §3.16: white, 1.5px ink border, padding clamp(20px, 3vw, 36px), column with 18px gap.
export function FormCard({ bar, className, children, ...props }: FormCardProps) {
  return (
    <div
      className={cx(formStackClasses, "border-[1.5px] border-ink bg-white p-[clamp(20px,3vw,36px)] text-ink", className)}
      {...props}
    >
      {bar && (
        <div className="eyebrow flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-[10px]">
          <span>{bar.left}</span>
          {bar.right != null && bar.right !== "" && <span className="text-right">{bar.right}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
