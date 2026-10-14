import { cx } from "./cx";

export interface ReviewCardProps {
  quote: string;
  /** First name. */
  name: string;
  city: string;
  /** „[Model · dimensiune]” */
  model: string;
  className?: string;
}

// DESIGN §3.14: `<figure>` padding 24px, card background, 1px rule; blockquote 17px;
// figcaption at the bottom: „[Prenume], [Oraș]” (14px 600) and the model (DM Mono 12px muted).
// Only real reviews, with the client's consent; a city or model the workshop left
// empty is dropped, not shown as a trailing comma or an empty line.
export function ReviewCard({ quote, name, city, model, className }: ReviewCardProps) {
  return (
    <figure className={cx("flex flex-col gap-4 border border-rule bg-card p-6", className)}>
      <blockquote className="text-[17px] leading-[1.55]">
        <p>{quote}</p>
      </blockquote>
      <figcaption className="mt-auto flex flex-col gap-[2px]">
        <span className="text-[14px] font-semibold">{[name, city].filter(Boolean).join(", ")}</span>
        {model && <span className="font-mono text-[12px] leading-[1.5] text-muted">{model}</span>}
      </figcaption>
    </figure>
  );
}
