import { Fragment, type ReactNode } from "react";
import { cx } from "./cx";

export interface SpecItem {
  k: string;
  v: ReactNode;
}

export interface SpecListProps {
  items: SpecItem[];
  className?: string;
}

// DESIGN §3.13: `<dl>` grid auto 1fr with a rule on top; dt DM Mono 12px uppercase .06em
// muted (padding 12px 20px 12px 0), dd 16px (padding 12px 0), both with a rule below.
export function SpecList({ items, className }: SpecListProps) {
  return (
    <dl className={cx("grid grid-cols-[auto_1fr] items-baseline border-t border-rule", className)}>
      {items.map((item) => (
        <Fragment key={item.k}>
          <dt className="border-b border-rule py-3 pr-5 font-mono text-[12px] leading-[1.5] tracking-[.06em] text-muted uppercase">
            {item.k}
          </dt>
          <dd className="border-b border-rule py-3 text-[16px] leading-[1.55]">{item.v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
