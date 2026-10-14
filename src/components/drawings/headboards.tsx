// Geometry and headboard variants of the line-art bed (docs/DESIGN.md §3.9, §3.11).
// Pure SVG fragments; the public component is `BedLineArt`.

import type { ModelId } from "@/lib/configurator/types";

export type BedTone = "light" | "dark";

/** Colours per tone (DESIGN §2.1 tokens). `fillWhite` is the mattress and pillows. */
export interface Palette {
  stroke: string;
  fill: string;
  fillWhite: string;
}

export const PALETTE: Record<BedTone, Palette> = {
  // ink outlines, `card` fills, `white` mattress and pillows (§3.9)
  light: { stroke: "#18191B", fill: "#F7F7F4", fillWhite: "#FFFFFF" },
  // the accent band (§3.11): `on-dark` outlines and dots, `accent` fills
  dark: { stroke: "#F3F3F0", fill: "#1E4D3B", fillWhite: "#1E4D3B" },
};

export const VIEW_BOX = { width: 200, height: 150 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** DESIGN's table measures `y` from the floor; SVG's y points down: `svgY = 150 - y - h`. */
function fromFloor(x: number, yFromFloor: number, w: number, h: number): Rect {
  return { x, y: VIEW_BOX.height - yFromFloor - h, w, h };
}

/** The eight elements of §3.9, already in SVG coordinates. */
export const BED = {
  floor: { x1: 10, x2: 190, y: VIEW_BOX.height - 20 },
  headboard: fromFloor(30, 20, 140, 100),
  legLeft: fromFloor(34, 20, 6, 10),
  legRight: fromFloor(160, 20, 6, 10),
  frame: fromFloor(26, 30, 148, 25),
  mattress: fromFloor(32, 55, 136, 15),
  pillow1: fromFloor(44, 70, 52, 14),
  pillow2: fromFloor(104, 70, 52, 14),
  pillowRadius: 5,
} as const;

/** Every outline: 1.5, never scaled with the drawing. */
export function strokeAttrs(stroke: string) {
  return {
    stroke,
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke",
  } as const;
}

const { x, y, w, h } = BED.headboard;
const right = x + w;
const bottom = y + h;

/** Path numbers rounded to 3 decimals, so 0.58 × 100 prints as 58, not 57.99999999999999. */
function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Closed outline of the headboard for each model (top edge differs, sides and base are shared). */
export function headboardPath(model: ModelId): string {
  switch (model) {
    case "capitonat": {
      const r = 4;
      return `M${x} ${bottom}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${right - r}A${r} ${r} 0 0 1 ${right} ${y + r}V${bottom}Z`;
    }
    case "arcuit": {
      const rx = w / 2;
      const ry = 0.58 * h;
      return `M${x} ${bottom}V${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${right} ${n(y + ry)}V${bottom}Z`;
    }
    case "canale": {
      const r = 10;
      return `M${x} ${bottom}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${right - r}A${r} ${r} 0 0 1 ${right} ${y + r}V${bottom}Z`;
    }
    case "lamele":
      return `M${x} ${bottom}V${y}H${right}V${bottom}Z`;
  }
}

/** The inner seam of the arched headboard: the same arc, ~4 units in, open at the base. */
export function arcuitSeamPath(inset = 4): string {
  const rx = w / 2 - inset;
  const ry = 0.58 * h - inset;
  const top = y + 0.58 * h;
  return `M${x + inset} ${bottom}V${n(top)}A${n(rx)} ${n(ry)} 0 0 1 ${right - inset} ${n(top)}V${bottom}`;
}

/** x positions of the vertical lines, every `step` units from the left edge, inside the headboard. */
export function verticalLineXs(step: number): number[] {
  const xs: number[] = [];
  for (let lx = x + step; lx < right; lx += step) xs.push(lx);
  return xs;
}

export const BUTTON_PATTERN = { size: 13, dots: [{ cx: 3, cy: 3 }, { cx: 9.5, cy: 9.5 }], r: 1 } as const;
export const CANALE_STEP = 13;
export const LAMELE_STEP = 8;

export function patternId(idPrefix: string): string {
  return `${idPrefix}-capitonat-dots`;
}

export interface HeadboardProps {
  model: ModelId;
  palette: Palette;
  idPrefix: string;
}

/** Fill, then the model's detail (dots or lines), then the outline on top so the joins stay clean. */
export function Headboard({ model, palette, idPrefix }: HeadboardProps) {
  const d = headboardPath(model);
  const lines = strokeAttrs(palette.stroke);
  const pid = patternId(idPrefix);

  return (
    <g data-headboard={model}>
      {model === "capitonat" && (
        <defs>
          <pattern
            id={pid}
            x={x}
            y={y}
            width={BUTTON_PATTERN.size}
            height={BUTTON_PATTERN.size}
            patternUnits="userSpaceOnUse"
          >
            {BUTTON_PATTERN.dots.map((dot) => (
              <circle key={`${dot.cx}-${dot.cy}`} cx={dot.cx} cy={dot.cy} r={BUTTON_PATTERN.r} fill={palette.stroke} />
            ))}
          </pattern>
        </defs>
      )}

      <path d={d} fill={palette.fill} />

      {model === "capitonat" && <path d={d} fill={`url(#${pid})`} />}
      {model === "arcuit" && <path d={arcuitSeamPath()} fill="none" {...lines} />}
      {model === "canale" &&
        verticalLineXs(CANALE_STEP).map((lx) => <line key={lx} x1={lx} y1={y} x2={lx} y2={bottom} {...lines} />)}
      {model === "lamele" &&
        verticalLineXs(LAMELE_STEP).map((lx) => <line key={lx} x1={lx} y1={y} x2={lx} y2={bottom} {...lines} />)}

      <path d={d} fill="none" {...lines} />
    </g>
  );
}
