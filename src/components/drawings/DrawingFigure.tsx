import { bedGeometry, caption, configCode, type Resolved } from "@/lib/configurator";
import { cx } from "@/components/site/cx";
import { BedDrawing } from "./BedDrawing";
import { DimensionOverlay } from "./DimensionOverlay";

export interface DrawingFigureProps {
  resolved: Resolved;
  /** Prefix of the SVG def ids. Default "bed". */
  idPrefix?: string;
  className?: string;
}

// DESIGN §4.2 item 1: the `<figure>` of the drawing. White, border 1.5px ink; a DM Mono
// 11px uppercase bar („Desen la scară · vedere din față” · code); the drawing on
// `.drafting` paper with aspect-ratio W/180 (W widens with nightstands, §5.4) and a 40px
// column on the right for the height dimension (§5.5); the §5.6 caption below.
export function DrawingFigure({ resolved, idPrefix = "bed", className }: DrawingFigureProps) {
  const code = configCode(resolved);
  const { w: W, h: H } = bedGeometry(resolved).world;

  return (
    <figure className={cx("border-[1.5px] border-ink bg-white text-ink", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-[14px] py-[10px] font-mono text-[11px] leading-[1.4] tracking-[.08em] uppercase">
        <span>Desen la scară · vedere din față</span>
        <span className="text-right normal-case whitespace-nowrap">{code}</span>
      </div>
      <div className="drafting pr-10">
        <div className="relative" style={{ aspectRatio: `${W} / ${H}` }}>
          <BedDrawing resolved={resolved} idPrefix={idPrefix} className="absolute inset-0 h-full w-full" />
          <DimensionOverlay resolved={resolved} />
        </div>
      </div>
      <figcaption className="border-t border-rule px-[14px] py-[10px] text-[15px] leading-[1.5] text-ink-2">
        {caption(resolved)}
      </figcaption>
    </figure>
  );
}
