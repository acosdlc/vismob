import type { ComponentProps } from "react";
import { cx } from "../cx";

export type FieldProps = ComponentProps<"div">;

// DESIGN §3.16: label, control and error stacked with a 6px gap. The grid that places
// fields next to each other (`minmax(min(220px, 100%), 1fr)`) belongs to the page.
export function Field({ className, ...props }: FieldProps) {
  return <div className={cx("flex min-w-0 flex-col gap-[6px]", className)} {...props} />;
}
