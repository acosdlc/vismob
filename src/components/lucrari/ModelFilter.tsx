import Link from "next/link";
import { cx } from "@/components/site/cx";
import type { Model, ModelId } from "@/lib/configurator/types";

export interface ModelFilterProps {
  /** `catalog.models`; the labels and the accepted `?model=` values. */
  models: readonly Pick<Model, "id" | "name">[];
  /** The model in the URL, null for „Toate”; left out while the URL is not known yet (no pill is current). */
  active?: ModelId | null;
}

/** DESIGN §4.4: Toate · Capitonat · Arcuit · Canale · Lamele. */
const ORDER: readonly ModelId[] = ["capitonat", "arcuit", "canale", "lamele"];

/** The `?model=` value as a ModelId, or null when absent or not a known model. */
export function parseModelParam(
  value: string | string[] | undefined,
  models: readonly Pick<Model, "id">[],
): ModelId | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return null;
  return models.some((model) => model.id === first) ? (first as ModelId) : null;
}

/** `/lucrari` for „Toate”, `/lucrari?model=<id>` otherwise. */
export function modelHref(model: ModelId | null): string {
  return model ? `/lucrari?model=${model}` : "/lucrari";
}

// DESIGN §4.4 with the pills of §4.2 step 02: DM Mono 14px, min-height 44px, border
// 1.5px ink, radius 2px; the selected one has an ink background, white text and
// aria-current="page". The state lives in the URL, so every pill is a link.
export function ModelFilter({ models, active }: ModelFilterProps) {
  const ordered = ORDER.map((id) => models.find((model) => model.id === id)).filter(
    (model): model is Pick<Model, "id" | "name"> => Boolean(model),
  );
  const pills: { id: ModelId | null; label: string }[] = [
    { id: null, label: "Toate" },
    ...ordered.map((model) => ({ id: model.id, label: model.name })),
  ];

  return (
    <ul className="flex list-none flex-wrap gap-[10px] p-0">
      {pills.map((pill) => {
        const current = active !== undefined && pill.id === active;
        return (
          <li key={pill.label}>
            <Link
              href={modelHref(pill.id)}
              aria-current={current ? "page" : undefined}
              className={cx(
                "inline-flex min-h-11 items-center rounded-ui border-[1.5px] border-ink px-4 font-mono text-[14px] leading-[1.2] no-underline transition-[background-color,color] duration-150",
                current ? "bg-ink text-white" : "bg-transparent text-ink hover:bg-ink hover:text-white",
              )}
            >
              {pill.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
