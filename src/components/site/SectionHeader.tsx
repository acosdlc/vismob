import type { ReactNode } from "react";
import { cx } from "./cx";
import { Eyebrow } from "./Eyebrow";

export interface SectionHeaderProps {
  /** e.g. „01 — Cum lucrăm” */
  eyebrow: string;
  title: ReactNode;
  /** Paragraph on the right (DESIGN §3.3): a string becomes a `<p>`, an element is placed as is. */
  aside?: ReactNode;
  id?: string;
  /** `dark` for the accent band: eyebrow rgba(255,255,255,.75), title white, aside rgba(255,255,255,.86). */
  tone?: "light" | "dark";
  className?: string;
}

// DESIGN §3.3. The page puts `clamp(32px, 4vw, 56px)` between this header and the content (§2.3).
export function SectionHeader({ eyebrow, title, aside, id, tone = "light", className }: SectionHeaderProps) {
  const dark = tone === "dark";
  const asideClasses = cx("max-w-[380px] text-[16px]", dark ? "text-[rgba(255,255,255,.86)]" : "text-ink-2");
  return (
    <div id={id} className={cx("flex flex-wrap items-end justify-between gap-5", className)}>
      <div className="flex max-w-[760px] flex-col gap-4">
        <Eyebrow className={cx("block", dark && "text-[rgba(255,255,255,.75)]")}>{eyebrow}</Eyebrow>
        <h2 className={cx("h2-section", dark && "text-white")}>{title}</h2>
      </div>
      {aside !== undefined &&
        aside !== null &&
        (typeof aside === "string" ? (
          <p className={asideClasses}>{aside}</p>
        ) : (
          <div className={asideClasses}>{aside}</div>
        ))}
    </div>
  );
}
