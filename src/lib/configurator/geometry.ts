// Geometry of the front view, to scale (docs/DESIGN.md §5.4). The unit is the
// centimetre. The world is 320 × 180 cm with the floor at y = 24; y grows
// upwards from the bottom of the world. The world widens when a bed with
// nightstands does not fit.
import type { Resolved } from "./rules";

/** y is the bottom edge, measured upwards. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BedGeometry {
  world: { w: number; h: number; floor: number };
  headboard: Rect;
  frame: Rect;
  mattress: Rect;
  pillows: Rect[];
  /** Empty when the base goes down to the floor. */
  legs: Rect[];
  /** Recessed plinth (ladă / sertare). */
  plinth?: Rect;
  /** Hidden, dashed lines: ladă or sertare. */
  hidden: Rect[];
  led?: Rect;
  nightstands: { box: Rect; legs: Rect[] }[];
  dimWidth: { x1: number; x2: number; label: string };
  dimHeight: { y1: number; y2: number; label: string };
}

export function bedGeometry(r: Resolved): BedGeometry {
  const H = 180,
    FLOOR = 24;
  const { w } = r;
  const { hb, led, nightstands } = r.cfg;
  const fw = w + 10; // frame: mattress + 5 cm on each side
  const hbw = fw + 4; // headboard: 2 cm wider on each side
  const W = Math.max(320, hbw + (nightstands ? 2 * (4 + 44) : 0) + 16);
  const CX = W / 2;
  const onLegs = r.base.id === "lemn" || r.base.id === "metal";
  const frameBottom = onLegs ? FLOOR + 12 : FLOOR + 2;
  const frameTop = FLOOR + 36;

  const legs: Rect[] = [];
  if (onLegs) {
    const lw = r.base.id === "metal" ? 3.5 : 5;
    legs.push({ x: CX - fw / 2 + 7, y: FLOOR, w: lw, h: 12 });
    legs.push({ x: CX + fw / 2 - 7 - lw, y: FLOOR, w: lw, h: 12 });
  }

  const hidden: Rect[] = [];
  const inner = frameTop - frameBottom;
  if (r.base.id === "lada") hidden.push({ x: CX - fw / 2 + 5, y: frameBottom + 4, w: fw - 10, h: inner - 8 });
  if (r.base.id === "sertare") {
    const dw = (fw - 16) / 2;
    hidden.push({ x: CX - fw / 2 + 5, y: frameBottom + 5, w: dw, h: inner - 10 });
    hidden.push({ x: CX + 3, y: frameBottom + 5, w: dw, h: inner - 10 });
  }

  const pillows: Rect[] = [];
  const pillowY = frameTop + 18; // on the mattress
  if (w >= 140) {
    const pw = (w - 16) / 2;
    pillows.push({ x: CX - 2 - pw, y: pillowY, w: pw, h: 16 }, { x: CX + 2, y: pillowY, w: pw, h: 16 });
  } else {
    const pw = Math.min(w - 20, 70);
    pillows.push({ x: CX - pw / 2, y: pillowY, w: pw, h: 16 });
  }

  const stands = nightstands
    ? [CX - hbw / 2 - 4 - 44, CX + hbw / 2 + 4].map((sx) => ({
        box: { x: sx, y: FLOOR + 8, w: 44, h: 38 },
        legs: [
          { x: sx + 4, y: FLOOR, w: 3, h: 8 },
          { x: sx + 37, y: FLOOR, w: 3, h: 8 },
        ],
      }))
    : [];

  return {
    world: { w: W, h: H, floor: FLOOR },
    headboard: { x: CX - hbw / 2, y: FLOOR, w: hbw, h: hb },
    frame: { x: CX - fw / 2, y: frameBottom, w: fw, h: inner },
    mattress: { x: CX - w / 2, y: frameTop, w, h: 18 },
    pillows,
    legs,
    plinth: onLegs ? undefined : { x: CX - fw / 2 + 4, y: FLOOR, w: fw - 8, h: 2 },
    hidden,
    led: led ? { x: CX - fw / 2 + 10, y: onLegs ? FLOOR + 10 : FLOOR + 0.6, w: fw - 20, h: 1.2 } : undefined,
    nightstands: stands,
    dimWidth: { x1: CX - w / 2, x2: CX + w / 2, label: `${w} cm` },
    dimHeight: { y1: FLOOR, y2: FLOOR + hb, label: `${hb} cm` },
  };
}

/** Converts world coordinates (y upwards) to SVG (y downwards). */
export const svgY = (rect: Rect, worldH: number) => worldH - rect.y - rect.h;
