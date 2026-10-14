// The bed drawing as data (docs/DESIGN.md §5.5), built on the geometry of
// §5.4. Pure: the browser maps the scene to JSX (BedDrawing) and the server
// serialises it with `svgString()` for the PNG attachment (PR-6). Coordinates
// are world centimetres already converted to SVG space (y down).
import { bedGeometry, svgY, type BedGeometry, type Rect } from "./geometry";
import type { Resolved } from "./rules";
import type { FamilyId, ModelId } from "./types";

/** What a node draws, for tests and `data-role` in the DOM; one role per element of §5.5. */
export type SceneRole =
  | "floor"
  | "nightstand"
  | "headboard"
  | "leg"
  | "plinth"
  | "led"
  | "frame"
  | "hidden"
  | "mattress"
  | "pillow";

/** Paint shared by every primitive. A stroke always renders with vector-effect="non-scaling-stroke". */
export interface Paint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  /** `url(#id)` of a SceneDef filter. */
  filter?: string;
  role?: SceneRole;
}

export interface LineNode extends Paint {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface RectNode extends Paint {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
}
export interface PathNode extends Paint {
  type: "path";
  d: string;
}
export interface CircleNode extends Paint {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}
export interface GroupNode {
  type: "group";
  role: SceneRole;
  children: SceneNode[];
}
export type SceneNode = LineNode | RectNode | PathNode | CircleNode | GroupNode;

/** `<pattern patternUnits="userSpaceOnUse">`, in cm, anchored at (x, y). */
export interface PatternDef {
  type: "pattern";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: SceneNode[];
}
/** `<linearGradient>` in objectBoundingBox units (0–1). */
export interface LinearGradientDef {
  type: "linearGradient";
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: { offset: number; color: string }[];
}
/** `<filter>` with one gaussian blur; the region is in percentages of the bounding box. */
export interface FilterDef {
  type: "filter";
  id: string;
  stdDeviation: number;
  region: { x: string; y: string; width: string; height: string };
}
export type SceneDef = PatternDef | LinearGradientDef | FilterDef;

export interface DrawingScene {
  /** World width in cm: 320, or wider with nightstands (§5.4). */
  width: number;
  height: 180;
  /** SVG y of the floor line. */
  floor: number;
  defs: SceneDef[];
  nodes: SceneNode[];
}

export interface SceneOptions {
  /** Prefix of every id, so two drawings on one page never share defs. Default "bed". */
  idPrefix?: string;
}

// §5.5 colours and strokes.
export const INK = "#18191B";
const OUTLINE: Pick<Paint, "stroke" | "strokeWidth"> = { stroke: INK, strokeWidth: 1.5 };
const WOOD_LEG = "#B48A5A";
const METAL = "#26282B";
const MATTRESS = "#FBFBF9";
const MATTRESS_SEAM = "rgba(24,25,27,.25)";
const PILLOW = "#FFFFFF";
const HIDDEN = "rgba(24,25,27,.7)";
const LED = "#FFC46B";
const LED_GLOW = "rgba(255,176,72,.55)";
const GRAIN = "rgba(60,35,10,.16)";

/** Numbers rounded to 3 decimals, so 0.58 × 120 prints as 69.6, not 69.60000000000001. */
function n(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A world rect (y upwards) as an SVG rect (y downwards). */
function rect(r: Rect, worldH: number, paint: Paint = {}): RectNode {
  return { type: "rect", x: n(r.x), y: n(svgY(r, worldH)), width: n(r.w), height: n(r.h), ...paint };
}

/** Top corner radius of the headboard per model (§5.5); arcuit is a path of its own. */
const TOP_RADIUS: Record<Exclude<ModelId, "arcuit">, number> = { capitonat: 3, canale: 8, lamele: 0 };

/** Closed outline of the headboard, in SVG coordinates. */
export function headboardPath(model: ModelId, x: number, y: number, w: number, h: number): string {
  const right = x + w;
  const bottom = y + h;
  if (model === "arcuit") {
    // One elliptical arc left to right (rx = w/2, ry = 0.58·h), straight sides down to the floor.
    const ry = 0.58 * h;
    return `M${n(x)} ${n(bottom)}V${n(y + ry)}A${n(w / 2)} ${n(ry)} 0 0 1 ${n(right)} ${n(y + ry)}V${n(bottom)}Z`;
  }
  const r = TOP_RADIUS[model];
  if (r === 0) return `M${n(x)} ${n(bottom)}V${n(y)}H${n(right)}V${n(bottom)}Z`;
  return (
    `M${n(x)} ${n(bottom)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)}` +
    `H${n(right - r)}A${r} ${r} 0 0 1 ${n(right)} ${n(y + r)}V${n(bottom)}Z`
  );
}

/** The inner seam of the arched headboard: the same outline inset, open at the base. */
export function arcuitSeamPath(x: number, y: number, w: number, h: number, inset = 3.5): string {
  const ry = 0.58 * h;
  const top = y + ry;
  return (
    `M${n(x + inset)} ${n(y + h)}V${n(top)}A${n(w / 2 - inset)} ${n(ry - inset)} 0 0 1 ` +
    `${n(x + w - inset)} ${n(top)}V${n(y + h)}`
  );
}

/** The §5.5 headboard pattern for a model, anchored at the headboard's top-left corner. */
function modelPattern(model: ModelId, id: string, x: number, y: number): PatternDef | null {
  switch (model) {
    case "capitonat":
      return {
        type: "pattern",
        id,
        x,
        y,
        width: 10,
        height: 10,
        children: [
          { type: "circle", cx: 2.5, cy: 2.5, r: 0.75, fill: "rgba(0,0,0,.42)" },
          { type: "circle", cx: 7.5, cy: 7.5, r: 0.75, fill: "rgba(0,0,0,.42)" },
        ],
      };
    case "canale":
      return {
        type: "pattern",
        id,
        x,
        y,
        width: 10,
        height: 10,
        children: [{ type: "rect", x: 9.3, y: 0, width: 0.7, height: 10, fill: "rgba(0,0,0,.30)" }],
      };
    case "lamele":
      return {
        type: "pattern",
        id,
        x,
        y,
        width: 7,
        height: 10,
        children: [{ type: "rect", x: 6.1, y: 0, width: 0.9, height: 10, fill: "rgba(0,0,0,.45)" }],
      };
    case "arcuit":
      return null;
  }
}

/** Wood grain: a 2 cm pattern of fibre lines, for the lemn family and the wooden legs. */
function grainPattern(id: string): PatternDef {
  return {
    type: "pattern",
    id,
    x: 0,
    y: 0,
    width: 2,
    height: 2,
    children: [{ type: "rect", x: 0.8, y: 0, width: 0.35, height: 2, fill: GRAIN }],
  };
}

/** Velvet and leather sheen: a 160° gradient (CSS angle, as in `.tex-catifea`) in bounding-box units. */
function sheenGradient(id: string): LinearGradientDef {
  const a = (160 * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  return {
    type: "linearGradient",
    id,
    x1: n(0.5 - dx),
    y1: n(0.5 - dy),
    x2: n(0.5 + dx),
    y2: n(0.5 + dy),
    stops: [
      { offset: 0, color: "rgba(255,255,255,.10)" },
      { offset: 1, color: "rgba(0,0,0,.16)" },
    ],
  };
}

/** Which texture overlay a family gets on headboard, frame and nightstands (§5.5). */
function familyTexture(family: FamilyId): "sheen" | "grain" | null {
  if (family === "catifea" || family === "piele") return "sheen";
  if (family === "lemn") return "grain";
  return null;
}

/** Fill, texture overlay, then the outline on top so the joins stay clean. */
function upholstered(r: Rect, worldH: number, hex: string, texture: string | null): SceneNode[] {
  const nodes: SceneNode[] = [rect(r, worldH, { fill: hex })];
  if (texture) nodes.push(rect(r, worldH, { fill: texture }));
  nodes.push(rect(r, worldH, { fill: "none", ...OUTLINE }));
  return nodes;
}

export function drawingScene(r: Resolved, opts: SceneOptions = {}): DrawingScene {
  const prefix = opts.idPrefix ?? "bed";
  const g: BedGeometry = bedGeometry(r);
  const { w: W, h: H, floor } = g.world;
  const hex = r.color.hex;
  const defs: SceneDef[] = [];
  const nodes: SceneNode[] = [];

  // Family texture (shared by headboard, frame and nightstands) and the wooden legs' grain.
  const textureKind = familyTexture(r.family.id);
  const grainId = `${prefix}-grain`;
  const needsGrain = textureKind === "grain" || r.base.id === "lemn";
  if (needsGrain) defs.push(grainPattern(grainId));
  let texture: string | null = null;
  if (textureKind === "sheen") {
    const id = `${prefix}-sheen`;
    defs.push(sheenGradient(id));
    texture = `url(#${id})`;
  } else if (textureKind === "grain") {
    texture = `url(#${grainId})`;
  }

  // 1. Floor line across the whole width.
  const floorY = H - floor;
  nodes.push({ type: "line", x1: 0, y1: floorY, x2: W, y2: floorY, ...OUTLINE, role: "floor" });

  // 2. Nightstands: legs, box with the family texture, a drawer line at mid height.
  for (const stand of g.nightstands) {
    const children: SceneNode[] = stand.legs.map((leg) => rect(leg, H, { fill: METAL, ...OUTLINE }));
    children.push(...upholstered(stand.box, H, hex, texture));
    const midY = n(svgY(stand.box, H) + stand.box.h / 2);
    children.push({
      type: "line",
      x1: n(stand.box.x),
      y1: midY,
      x2: n(stand.box.x + stand.box.w),
      y2: midY,
      ...OUTLINE,
    });
    nodes.push({ type: "group", role: "nightstand", children });
  }

  // 3. Headboard: colour, texture, model pattern (or the arcuit seam), outline.
  {
    const hb = g.headboard;
    const x = n(hb.x);
    const y = n(svgY(hb, H));
    const d = headboardPath(r.model.id, hb.x, svgY(hb, H), hb.w, hb.h);
    const children: SceneNode[] = [{ type: "path", d, fill: hex }];
    if (texture) children.push({ type: "path", d, fill: texture });
    const patternId = `${prefix}-${r.model.id}`;
    const pattern = modelPattern(r.model.id, patternId, x, y);
    if (pattern) {
      defs.push(pattern);
      children.push({ type: "path", d, fill: `url(#${patternId})` });
    }
    if (r.model.id === "arcuit") {
      children.push({
        type: "path",
        d: arcuitSeamPath(hb.x, svgY(hb, H), hb.w, hb.h),
        fill: "none",
        stroke: "rgba(0,0,0,.32)",
        strokeWidth: 1,
      });
    }
    children.push({ type: "path", d, fill: "none", ...OUTLINE });
    nodes.push({ type: "group", role: "headboard", children });
  }

  // 4. Legs: wood with grain, or thin metal.
  for (const leg of g.legs) {
    if (r.base.id === "lemn") {
      nodes.push({
        type: "group",
        role: "leg",
        children: [
          rect(leg, H, { fill: WOOD_LEG }),
          rect(leg, H, { fill: `url(#${grainId})` }),
          rect(leg, H, { fill: "none", ...OUTLINE }),
        ],
      });
    } else {
      nodes.push(rect(leg, H, { fill: METAL, ...OUTLINE, role: "leg" }));
    }
  }

  // 5. Plinth (ladă / sertare).
  if (g.plinth) nodes.push(rect(g.plinth, H, { fill: INK, ...OUTLINE, role: "plinth" }));

  // 6. LED strip with a blurred glow under it.
  if (g.led) {
    const glowId = `${prefix}-glow`;
    defs.push({
      type: "filter",
      id: glowId,
      stdDeviation: 3,
      region: { x: "-10%", y: "-400%", width: "120%", height: "900%" },
    });
    // The glow reaches 2 cm under the strip, but never below the floor (bases on the floor).
    const below = Math.min(2, g.led.y - g.world.floor);
    const glow: Rect = { x: g.led.x, y: g.led.y - below, w: g.led.w, h: g.led.h + below };
    nodes.push({
      type: "group",
      role: "led",
      children: [rect(glow, H, { fill: LED_GLOW, filter: `url(#${glowId})` }), rect(g.led, H, { fill: LED })],
    });
  }

  // 7. Frame.
  nodes.push({ type: "group", role: "frame", children: upholstered(g.frame, H, hex, texture) });

  // 8. Hidden lines (storage box or drawers).
  for (const box of g.hidden) {
    nodes.push(rect(box, H, { fill: "none", stroke: HIDDEN, strokeWidth: 1.5, strokeDasharray: "4 3", role: "hidden" }));
  }

  // 9. Mattress with its seam ~1.5 cm above the base.
  {
    const m = g.mattress;
    const seamY = n(svgY(m, H) + m.h - 1.5);
    nodes.push({
      type: "group",
      role: "mattress",
      children: [
        rect(m, H, { fill: MATTRESS, ...OUTLINE }),
        { type: "line", x1: n(m.x), y1: seamY, x2: n(m.x + m.w), y2: seamY, stroke: MATTRESS_SEAM, strokeWidth: 1 },
      ],
    });
  }

  // 10. Pillows.
  for (const p of g.pillows) nodes.push({ ...rect(p, H, { fill: PILLOW, ...OUTLINE, role: "pillow" }), rx: 4 });

  return { width: W, height: 180, floor: floorY, defs, nodes };
}

/* ---------- serialisation (the PNG route, PR-6) ---------- */

export function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type AttrValue = string | number | undefined;

function attrs(pairs: Record<string, AttrValue>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeAttr(String(v))}"`)
    .join("");
}

function paintAttrs(p: Paint): Record<string, AttrValue> {
  return {
    fill: p.fill,
    stroke: p.stroke,
    "stroke-width": p.strokeWidth,
    "stroke-dasharray": p.strokeDasharray,
    "vector-effect": p.stroke ? "non-scaling-stroke" : undefined,
    filter: p.filter,
    "data-role": p.role,
  };
}

export function nodeToString(node: SceneNode): string {
  switch (node.type) {
    case "group":
      return `<g data-role="${node.role}">${node.children.map(nodeToString).join("")}</g>`;
    case "line":
      return `<line${attrs({ x1: node.x1, y1: node.y1, x2: node.x2, y2: node.y2, ...paintAttrs(node) })}/>`;
    case "rect":
      return `<rect${attrs({
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rx: node.rx,
        ...paintAttrs(node),
      })}/>`;
    case "circle":
      return `<circle${attrs({ cx: node.cx, cy: node.cy, r: node.r, ...paintAttrs(node) })}/>`;
    case "path":
      return `<path${attrs({ d: node.d, ...paintAttrs(node) })}/>`;
  }
}

export function defToString(def: SceneDef): string {
  switch (def.type) {
    case "pattern":
      return (
        `<pattern${attrs({
          id: def.id,
          x: def.x,
          y: def.y,
          width: def.width,
          height: def.height,
          patternUnits: "userSpaceOnUse",
        })}>` +
        def.children.map(nodeToString).join("") +
        `</pattern>`
      );
    case "linearGradient":
      return (
        `<linearGradient${attrs({ id: def.id, x1: def.x1, y1: def.y1, x2: def.x2, y2: def.y2 })}>` +
        def.stops.map((s) => `<stop${attrs({ offset: s.offset, "stop-color": s.color })}/>`).join("") +
        `</linearGradient>`
      );
    case "filter":
      return (
        `<filter${attrs({ id: def.id, ...def.region })}>` +
        `<feGaussianBlur${attrs({ stdDeviation: def.stdDeviation })}/>` +
        `</filter>`
      );
  }
}

/** A standalone SVG document of the drawing, the same defs and nodes the browser renders. */
export function svgString(r: Resolved, opts: SceneOptions = {}): string {
  const scene = drawingScene(r, opts);
  const defs = scene.defs.length ? `<defs>${scene.defs.map(defToString).join("")}</defs>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}">` +
    defs +
    scene.nodes.map(nodeToString).join("") +
    `</svg>`
  );
}
