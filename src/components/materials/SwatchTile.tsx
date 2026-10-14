"use client";

import Image from "next/image";
import { cx } from "@/components/site/cx";
import { CheckIcon } from "@/components/site/Icons";
import type { SwatchTileProps, SwatchTileState } from "./types";

// DESIGN §3.10, Materiale variant: the whole tile is a `<button aria-pressed>` whose name is
// the colour's name. The 1:1 square reuses the grid swatch look (1px rgba(24,25,27,.25)
// border, photo or colour + family texture from §2.4). Under it: the name (14px 600), the
// code (DM Mono, muted) and the state line in mono. Selected: outline 2px ink, offset 3px,
// and a 26px black disc with a white check 6px from the bottom-right corner. When the box is
// full the tile only looks disabled: it stays focusable (aria-disabled) so the message
// „cutia e plină” is reachable by keyboard; the click does nothing.

export const TILE_STATE_TEXT: Record<SwatchTileState, (code: string) => string> = {
  add: () => "+ adaugă mostra",
  "in-box": (code) => `în cutie · ${code}`,
  full: () => "cutia e plină",
};

export function SwatchTile({ item, state, onToggle }: SwatchTileProps) {
  const selected = state === "in-box";
  const full = state === "full";
  const stateId = `mostra-${item.id}-stare`;

  return (
    <button
      type="button"
      aria-label={item.name}
      aria-pressed={selected}
      aria-disabled={full || undefined}
      aria-describedby={stateId}
      onClick={() => {
        if (!full) onToggle(item.id);
      }}
      data-state={state}
      data-color={item.id}
      className={cx(
        "flex w-full flex-col gap-2 text-left transition-[outline-color] duration-150 focus-visible:outline-accent focus-visible:outline-offset-2",
        selected && "outline-2 outline-offset-[3px] outline-ink",
        full && "cursor-not-allowed",
      )}
    >
      <span
        className={cx(
          "relative block aspect-square w-full overflow-hidden border border-[rgba(24,25,27,.25)]",
          !item.photoSrc && `tex-${item.familyId}`,
          full && "opacity-50",
        )}
        style={item.photoSrc ? undefined : { backgroundColor: item.hex }}
      >
        {item.photoSrc && (
          <Image src={item.photoSrc} alt="" fill sizes="(min-width: 60rem) 160px, 33vw" className="object-cover" />
        )}
        {selected && (
          <span
            aria-hidden="true"
            className="absolute right-[6px] bottom-[6px] flex size-[26px] items-center justify-center rounded-full bg-ink text-white"
          >
            <CheckIcon className="h-[10px] w-3" />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-[2px]">
        <span className={cx("text-[14px] leading-[1.3] font-semibold", full && "text-ink-2")}>{item.name}</span>
        <span className="font-mono text-[12px] leading-[1.4] text-muted">{item.code}</span>
        <span
          id={stateId}
          className={cx(
            "font-mono text-[12px] leading-[1.4]",
            selected ? "font-medium text-ink" : full ? "text-muted" : "text-ink-2",
          )}
        >
          {TILE_STATE_TEXT[state](item.code)}
        </span>
      </span>
    </button>
  );
}
