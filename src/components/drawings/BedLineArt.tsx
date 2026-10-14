import type { ModelId } from "@/lib/configurator/types";
import { BED, Headboard, PALETTE, VIEW_BOX, strokeAttrs, type BedTone } from "./headboards";

export type BedModel = ModelId;
export type { BedTone };

export interface BedLineArtProps {
  model: BedModel;
  /** `light`: ink on card/white (model cards, §3.9). `dark`: on-dark on accent (the configurator band, §3.11). */
  tone?: BedTone;
  /** Sizes the drawing; it keeps the 4:3 ratio of its viewBox. */
  className?: string;
  /** Prefix of the `<pattern>` id, so several drawings on one page do not share ids. */
  idPrefix?: string;
}

// DESIGN §3.9: the line-art bed, viewBox 200×150, drawn floor → headboard → legs → frame →
// mattress → pillows, every outline 1.5 with vector-effect="non-scaling-stroke".
// Decorative: aria-hidden; the parent supplies the text (model name, caption).
export function BedLineArt({ model, tone = "light", className, idPrefix = "bed-line-art" }: BedLineArtProps) {
  const palette = PALETTE[tone];
  const lines = strokeAttrs(palette.stroke);
  const { floor, legLeft, legRight, frame, mattress, pillow1, pillow2, pillowRadius } = BED;

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      aria-hidden="true"
      focusable="false"
      className={className}
      data-model={model}
      data-tone={tone}
    >
      <line x1={floor.x1} y1={floor.y} x2={floor.x2} y2={floor.y} {...lines} />
      <Headboard model={model} palette={palette} idPrefix={idPrefix} />
      <rect x={legLeft.x} y={legLeft.y} width={legLeft.w} height={legLeft.h} fill={palette.fill} {...lines} />
      <rect x={legRight.x} y={legRight.y} width={legRight.w} height={legRight.h} fill={palette.fill} {...lines} />
      <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill={palette.fill} {...lines} />
      <rect x={mattress.x} y={mattress.y} width={mattress.w} height={mattress.h} fill={palette.fillWhite} {...lines} />
      <rect
        x={pillow1.x}
        y={pillow1.y}
        width={pillow1.w}
        height={pillow1.h}
        rx={pillowRadius}
        fill={palette.fillWhite}
        {...lines}
      />
      <rect
        x={pillow2.x}
        y={pillow2.y}
        width={pillow2.w}
        height={pillow2.h}
        rx={pillowRadius}
        fill={palette.fillWhite}
        {...lines}
      />
    </svg>
  );
}
