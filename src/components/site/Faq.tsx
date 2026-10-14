import { cx } from "./cx";

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqProps {
  items: FaqItem[];
  className?: string;
}

// DESIGN §3.15: native `<details>` in a list with a 1px ink rule on top and a rule under
// each item; summary 18px 600 padding 20px 0; answer 16px ink-2 max-width 640px, margin
// 0 0 20px. The +/− indicator is the optional SVG the spec allows (outline, §2.5 style).
export function Faq({ items, className }: FaqProps) {
  return (
    <ul className={cx("list-none border-t border-ink", className)}>
      {items.map((item) => (
        <li key={item.q} className="border-b border-rule">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[18px] leading-[1.3] font-semibold [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <svg
                viewBox="0 0 12 12"
                width={12}
                height={12}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                aria-hidden="true"
                focusable="false"
                className="shrink-0"
              >
                <path d="M0 6h12" />
                <path d="M6 0v12" className="group-open:hidden" />
              </svg>
            </summary>
            <p className="mb-5 max-w-[640px] text-[16px] text-ink-2">{item.a}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
