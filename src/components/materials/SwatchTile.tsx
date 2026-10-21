import Image from "next/image";
import Link from "next/link";
import { cx } from "@/components/site/cx";
import type { SwatchTileProps } from "./types";

// DESIGN §3.10, Materiale variant: the whole tile is a link to the configurator with
// the colour preselected. The 1:1 square reuses the grid swatch look (1px
// rgba(24,25,27,.25) border, photo or colour + family texture from §2.4); under it the
// name (14px 600) and the code (DM Mono 12px, muted).
export function SwatchTile({ item, href }: SwatchTileProps) {
  return (
    <Link
      href={href}
      data-color={item.id}
      className="flex w-full flex-col gap-2 text-left no-underline focus-visible:outline-accent focus-visible:outline-offset-2"
    >
      <span
        className={cx(
          "relative block aspect-square w-full overflow-hidden border border-[rgba(24,25,27,.25)]",
          !item.photoSrc && `tex-${item.familyId}`,
        )}
        style={item.photoSrc ? undefined : { backgroundColor: item.hex }}
      >
        {item.photoSrc && (
          <Image src={item.photoSrc} alt="" fill sizes="(min-width: 60rem) 160px, 33vw" className="object-cover" />
        )}
      </span>
      <span className="flex flex-col gap-[2px]">
        <span className="text-[14px] leading-[1.3] font-semibold">{item.name}</span>
        <span className="font-mono text-[12px] leading-[1.4] text-muted">{item.code}</span>
      </span>
    </Link>
  );
}
