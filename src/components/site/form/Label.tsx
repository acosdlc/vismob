import type { ComponentProps } from "react";
import { cx } from "../cx";

export type LabelProps = ComponentProps<"label">;

// DESIGN §3.16: the label sits above the field, 14px, 600. The 6px gap to the field
// comes from the `Field` wrapper.
export function Label({ className, ...props }: LabelProps) {
  return <label className={cx("text-[14px] leading-[1.4] font-semibold text-ink", className)} {...props} />;
}
