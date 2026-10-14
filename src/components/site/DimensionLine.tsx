import { cx } from "./cx";

export interface DimensionLineProps {
  /** e.g. „180 cm” */
  label: string;
  orientation: "horizontal" | "vertical";
  /** CSS colour behind the label, so it cuts the line. Default: the page paper. */
  background?: string;
  /** Position and length come from the caller (e.g. `absolute inset-x-0 top-2`). */
  className?: string;
}

// DESIGN §3.5. Decorative: the value is repeated in text elsewhere, so aria-hidden.
export function DimensionLine({
  label,
  orientation,
  background = "var(--color-paper)",
  className,
}: DimensionLineProps) {
  const text = "relative font-mono text-[12px] leading-4 text-ink";

  if (orientation === "vertical") {
    return (
      <div
        aria-hidden="true"
        className={cx("relative flex w-4 flex-col items-center justify-center border-y-[1.5px] border-ink", className)}
      >
        <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-ink" />
        <span className={cx(text, "rotate-180 py-[10px] [writing-mode:vertical-rl]")} style={{ background }}>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cx("relative flex h-4 items-center justify-center border-x-[1.5px] border-ink", className)}
    >
      <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-ink" />
      <span className={cx(text, "px-[10px]")} style={{ background }}>
        {label}
      </span>
    </div>
  );
}
