import { cx } from "./cx";

export interface ProcessCardProps {
  /** e.g. „01” */
  number: string;
  title: string;
  text: string;
  meta: string;
  className?: string;
}

// DESIGN §3.8: `<li>` inside an `<ol class="list-none">`. Card padding 24px, 1px rule,
// `card` background, column gap 12px; number DM Mono 34px accent, H3 20px (margin-top 6px),
// paragraph 16px ink-2, meta at the bottom over a dashed rule (DM Mono 12px muted).
export function ProcessCard({ number, title, text, meta, className }: ProcessCardProps) {
  return (
    <li className={cx("flex flex-col gap-3 border border-rule bg-card p-6", className)}>
      <span className="font-mono text-[34px] leading-none text-accent">{number}</span>
      <h3 className="h3-card mt-[6px]">{title}</h3>
      <p className="text-[16px] text-ink-2">{text}</p>
      <p className="mt-auto border-t border-dashed border-rule pt-3 font-mono text-[12px] leading-[1.5] text-muted">
        {meta}
      </p>
    </li>
  );
}
