import type { ReactNode } from "react";
import { cx } from "./cx";

export type PhotoRatio = "5:4" | "4:3" | "4:5" | "1:1";

export const RATIO_CLASS: Record<PhotoRatio, string> = {
  "5:4": "aspect-[5/4]",
  "4:3": "aspect-[4/3]",
  "4:5": "aspect-[4/5]",
  "1:1": "aspect-square",
};

export interface PhotoPlaceholderProps {
  ratio: PhotoRatio;
  /** e.g. „FOTO 01” */
  label?: string;
  /** The frame description from DESIGN §8. */
  frame?: string;
  className?: string;
  /** Overlays (e.g. the hero ticket), positioned absolutely by the caller. */
  children?: ReactNode;
}

// DESIGN §3.4: the hatched box, with the label (DM Mono 12px 500, .06em) and the frame text
// (DM Mono 12px ink-2, line-height 1.45) 16px from the top-left corner.
export function PhotoPlaceholder({ ratio, label, frame, className, children }: PhotoPlaceholderProps) {
  return (
    <div className={cx("photo-placeholder relative overflow-hidden", RATIO_CLASS[ratio], className)}>
      {(label || frame) && (
        <div className="absolute top-4 right-4 left-4 flex flex-col gap-1 font-mono text-[12px] leading-[1.45]">
          {label && <span className="font-medium tracking-[.06em]">{label}</span>}
          {frame && <p className="text-ink-2">{frame}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
