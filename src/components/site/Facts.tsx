import { cx } from "./cx";

export interface Fact {
  label: string;
  value: string;
}

export interface FactsProps {
  items: Fact[];
  className?: string;
}

// DESIGN §3.7: auto-fit minmax(min(220px,100%),1fr), gap 0 32px, rule borders top and
// bottom, items padding-block 22px, eyebrow + value (Archivo 600 18px).
export function Facts({ items, className }: FactsProps) {
  return (
    <dl
      className={cx(
        "grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-8 border-y border-rule",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 py-[22px]">
          <dt className="eyebrow">{item.label}</dt>
          <dd className="text-[18px] leading-[1.3] font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
