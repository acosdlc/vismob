import type { ModelId } from "@/lib/configurator/types";
import { strokeAttrs } from "@/components/drawings/headboards";

// DESIGN §4.2 step 01: the 64×40 headboard icon of a model card, in the line-art style of
// §3.9 (ink outlines 1.5 with non-scaling-stroke, `card` fill). Decorative: aria-hidden,
// the card carries the model's name.

export const ICON_VIEW_BOX = { width: 64, height: 40 } as const;

const INK = "#18191B";
const CARD = "#F7F7F4";

/** The headboard rectangle inside the icon, with room for the stroke. */
const HB = { x: 2, y: 2, w: 60, h: 36 } as const;
const RIGHT = HB.x + HB.w;
const BOTTOM = HB.y + HB.h;

function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Closed outline per model: the top edge differs (§3.9), sides and base are shared. */
export function iconPath(model: ModelId): string {
  const { x, y } = HB;
  switch (model) {
    case "capitonat": {
      const r = 4;
      return `M${x} ${BOTTOM}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${RIGHT - r}A${r} ${r} 0 0 1 ${RIGHT} ${y + r}V${BOTTOM}Z`;
    }
    case "arcuit": {
      const rx = HB.w / 2;
      const ry = 0.58 * HB.h;
      return `M${x} ${BOTTOM}V${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${RIGHT} ${n(y + ry)}V${BOTTOM}Z`;
    }
    case "canale": {
      const r = 8;
      return `M${x} ${BOTTOM}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${RIGHT - r}A${r} ${r} 0 0 1 ${RIGHT} ${y + r}V${BOTTOM}Z`;
    }
    case "lamele":
      return `M${x} ${BOTTOM}V${y}H${RIGHT}V${BOTTOM}Z`;
  }
}

/** Vertical lines every `step` units, inside the headboard. */
function lineXs(step: number): number[] {
  const xs: number[] = [];
  for (let lx = HB.x + step; lx < RIGHT - 1; lx += step) xs.push(lx);
  return xs;
}

const CANALE_STEP = 8;
const LAMELE_STEP = 5;
const DOTS = { size: 10, r: 0.9, at: [{ cx: 2.5, cy: 2.5 }, { cx: 7.5, cy: 7.5 }] } as const;

export interface HeadboardIconProps {
  model: ModelId;
  /** Prefix of the dots `<pattern>` id, so four icons on one page do not share ids. */
  idPrefix?: string;
  className?: string;
}

export function HeadboardIcon({ model, idPrefix = "hb-icon", className }: HeadboardIconProps) {
  const d = iconPath(model);
  const lines = strokeAttrs(INK);
  const pid = `${idPrefix}-${model}-dots`;
  // The arched seam: the same arc ~3 units in, open at the base (§3.9).
  const seamInset = 3;
  const seam = `M${HB.x + seamInset} ${BOTTOM}V${n(HB.y + 0.58 * HB.h)}A${n(HB.w / 2 - seamInset)} ${n(0.58 * HB.h - seamInset)} 0 0 1 ${RIGHT - seamInset} ${n(HB.y + 0.58 * HB.h)}V${BOTTOM}`;

  return (
    <svg
      viewBox={`0 0 ${ICON_VIEW_BOX.width} ${ICON_VIEW_BOX.height}`}
      width={ICON_VIEW_BOX.width}
      height={ICON_VIEW_BOX.height}
      aria-hidden="true"
      focusable="false"
      className={className}
      data-model={model}
    >
      {model === "capitonat" && (
        <defs>
          <pattern id={pid} x={HB.x} y={HB.y} width={DOTS.size} height={DOTS.size} patternUnits="userSpaceOnUse">
            {DOTS.at.map((dot) => (
              <circle key={`${dot.cx}-${dot.cy}`} cx={dot.cx} cy={dot.cy} r={DOTS.r} fill={INK} />
            ))}
          </pattern>
        </defs>
      )}
      <path d={d} fill={CARD} />
      {model === "capitonat" && <path d={d} fill={`url(#${pid})`} />}
      {model === "arcuit" && <path d={seam} fill="none" {...lines} />}
      {model === "canale" &&
        lineXs(CANALE_STEP).map((lx) => <line key={lx} x1={lx} y1={HB.y + 6} x2={lx} y2={BOTTOM} {...lines} />)}
      {model === "lamele" &&
        lineXs(LAMELE_STEP).map((lx) => <line key={lx} x1={lx} y1={HB.y} x2={lx} y2={BOTTOM} {...lines} />)}
      <path d={d} fill="none" {...lines} />
    </svg>
  );
}
