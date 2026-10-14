import type { ComponentProps } from "react";
import { cx } from "../cx";
import { describedBy } from "./FieldError";
import { invalidClasses } from "./Input";

export interface FileInputProps extends Omit<ComponentProps<"input">, "type"> {
  /** Error state: red border, `aria-invalid="true"` and `aria-describedby` → the `FieldError` of this `id`. */
  invalid?: boolean;
}

// DESIGN §3.16: `input[type=file]` with padding 12px and a 1px dashed field border.
// `accept` and `multiple` come from the caller (e.g. `accept="image/*" multiple`).
export function FileInput({
  className,
  invalid = false,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: FileInputProps) {
  return (
    <input
      type="file"
      id={id}
      className={cx(
        "block w-full min-h-12 rounded-ui border border-dashed border-field bg-white p-3 text-[16px] leading-[1.4] text-ink",
        invalid && invalidClasses,
        className,
      )}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      aria-describedby={describedBy(id, invalid, ariaDescribedBy)}
      {...props}
    />
  );
}
