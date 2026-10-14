import type { ComponentProps } from "react";
import { cx } from "../cx";
import { describedBy } from "./FieldError";
import { controlClasses, invalidClasses } from "./Input";

export interface SelectProps extends ComponentProps<"select"> {
  /** Error state: red border, `aria-invalid="true"` and `aria-describedby` → the `FieldError` of this `id`. */
  invalid?: boolean;
}

// DESIGN §3.16: same box as the input (48px, 0 14px, field border, 2px, 16px). Native
// select, native arrow; the options are the caller's children.
export function Select({
  className,
  invalid = false,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  children,
  ...props
}: SelectProps) {
  return (
    <select
      id={id}
      className={cx(controlClasses, invalid && invalidClasses, className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      aria-describedby={describedBy(id, invalid, ariaDescribedBy)}
      {...props}
    >
      {children}
    </select>
  );
}
