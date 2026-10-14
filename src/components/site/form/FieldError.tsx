import type { ComponentProps } from "react";
import { cx } from "../cx";

/** The id a control's `aria-describedby` points at when it is invalid. */
export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`;
}

/**
 * `aria-describedby` for a control: its own hints plus, when invalid, the FieldError id.
 * Returns undefined when there is nothing to point at, so no empty attribute is rendered.
 */
export function describedBy(fieldId: string | undefined, invalid: boolean, own?: string): string | undefined {
  const ids = [own, invalid && fieldId ? fieldErrorId(fieldId) : undefined].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export interface FieldErrorProps extends Omit<ComponentProps<"p">, "id"> {
  /** The id of the control this error belongs to; the element gets `${fieldId}-error`. */
  fieldId: string;
}

// DESIGN §3.16: 14px error text under the field, linked through aria-describedby.
// Renders nothing while there is no message.
export function FieldError({ fieldId, className, children, ...props }: FieldErrorProps) {
  if (!children) return null;
  return (
    <p id={fieldErrorId(fieldId)} className={cx("text-[14px] leading-[1.4] text-error", className)} {...props}>
      {children}
    </p>
  );
}
