import type { ComponentProps } from "react";
import { cx } from "../cx";
import { describedBy } from "./FieldError";
import { invalidClasses } from "./Input";

export interface TextareaProps extends ComponentProps<"textarea"> {
  /** Error state: red border, `aria-invalid="true"` and `aria-describedby` → the `FieldError` of this `id`. */
  invalid?: boolean;
}

// DESIGN §3.16: like the input, with padding 12px 14px and vertical resize. Rows come from the caller.
export function Textarea({
  className,
  invalid = false,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: TextareaProps) {
  return (
    <textarea
      id={id}
      className={cx(
        "block w-full min-h-12 resize-y rounded-ui border border-field bg-white px-[14px] py-3 text-[16px] leading-[1.4] text-ink",
        invalid && invalidClasses,
        className,
      )}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      aria-describedby={describedBy(id, invalid, ariaDescribedBy)}
      {...props}
    />
  );
}
