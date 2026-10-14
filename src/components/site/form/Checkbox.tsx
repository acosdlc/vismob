import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";
import { describedBy } from "./FieldError";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "children"> {
  /** The label text, e.g. „Vreau să veniți la măsurători”. */
  children: ReactNode;
  /** Error state: `aria-invalid="true"` and `aria-describedby` → the `FieldError` of this `id`. */
  invalid?: boolean;
  /** Classes for the wrapping `<label>`; `className` goes to the input. */
  labelClassName?: string;
}

// DESIGN §3.16 and §7: a real `<input type="checkbox">` of 20×20 with accent-color, inside a
// flex `<label>` with a 12px gap; the whole label is the target (min 44px).
export function Checkbox({
  children,
  className,
  labelClassName,
  invalid = false,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: CheckboxProps) {
  return (
    <label htmlFor={id} className={cx("flex min-h-11 items-start gap-3 text-ink", labelClassName)}>
      <input
        type="checkbox"
        id={id}
        className={cx("mt-[3px] size-5 shrink-0 accent-accent", className)}
        aria-invalid={ariaInvalid ?? (invalid || undefined)}
        aria-describedby={describedBy(id, invalid, ariaDescribedBy)}
        {...props}
      />
      <span>{children}</span>
    </label>
  );
}
