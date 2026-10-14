import type { ComponentProps } from "react";
import { cx } from "../cx";
import { describedBy } from "./FieldError";

/** Shared look of `input` and `select` (DESIGN §3.16): 48px, 0 14px, 1px field border, 2px radius, 16px text. */
export const controlClasses =
  "block w-full min-h-12 rounded-ui border border-field bg-white px-[14px] py-0 text-[16px] leading-[1.4] text-ink";

/** The error state (§3.16): border in the error colour; aria-invalid and aria-describedby are set by the component. */
export const invalidClasses = "border-error";

export interface InputProps extends ComponentProps<"input"> {
  /** Error state: red border, `aria-invalid="true"` and `aria-describedby` → the `FieldError` of this `id`. */
  invalid?: boolean;
}

// Not for `type="file"`: that is `FileInput`. React 19 passes `ref` as a prop, so a
// client form can hold a ref to the native element without `forwardRef`.
export function Input({
  className,
  invalid = false,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: InputProps) {
  return (
    <input
      id={id}
      className={cx(controlClasses, invalid && invalidClasses, className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      aria-describedby={describedBy(id, invalid, ariaDescribedBy)}
      {...props}
    />
  );
}
