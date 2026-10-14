import type { ComponentProps } from "react";
import { cx } from "./cx";

// DESIGN §3.3: `<span class="eyebrow">01 — Cum lucrăm</span>` above a heading.
export function Eyebrow({ className, ...props }: ComponentProps<"span">) {
  return <span className={cx("eyebrow", className)} {...props} />;
}
