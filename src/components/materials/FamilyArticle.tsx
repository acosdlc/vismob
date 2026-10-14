"use client";

import { Fragment } from "react";
import type { Family } from "@/lib/configurator/types";
import { SwatchTile } from "./SwatchTile";
import type { SampleItem, SwatchTileState } from "./types";

// DESIGN §4.3 „Familia”: an <article> with padding-block 32px and a rule below, in two
// wrapping columns: the info (flex 1 1 260px: H2 26px, the description 16px ink-2, the specs
// as a <dl> in mono 12px on an auto 1fr grid with gap 6px 16px) and the tile grid
// (flex 2 1 420px, auto-fill minmax(min(118px,100%),1fr), gap 16px 12px). The §3.13 SpecList
// is not reused: its rules, 12px padding and 16px values are a different list.

export interface FamilyArticleProps {
  family: Family;
  /** The family's colours as sample items, in catalogue order. */
  items: SampleItem[];
  stateOf: (id: string) => SwatchTileState;
  onToggle: (id: string) => void;
}

export function FamilyArticle({ family, items, stateOf, onToggle }: FamilyArticleProps) {
  const headingId = `familie-${family.id}`;
  return (
    <article aria-labelledby={headingId} className="flex flex-wrap gap-[clamp(24px,3vw,40px)] border-b border-rule py-8" data-family={family.id}>
      <div className="flex flex-[1_1_260px] flex-col gap-4">
        <h2 id={headingId} className="h2-family">
          {family.name}
        </h2>
        {family.description && <p className="text-[16px] leading-[1.55] text-ink-2">{family.description}</p>}
        {family.specs && family.specs.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-[6px] font-mono text-[12px] leading-[1.5]">
            {family.specs.map((spec) => (
              <Fragment key={spec.k}>
                <dt className="text-muted">{spec.k}</dt>
                <dd>{spec.v}</dd>
              </Fragment>
            ))}
          </dl>
        )}
      </div>
      <ul className="grid flex-[2_1_420px] list-none grid-cols-[repeat(auto-fill,minmax(min(118px,100%),1fr))] content-start gap-x-3 gap-y-4 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <SwatchTile item={item} state={stateOf(item.id)} onToggle={onToggle} />
          </li>
        ))}
      </ul>
    </article>
  );
}
