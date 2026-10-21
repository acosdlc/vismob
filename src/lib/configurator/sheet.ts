// The drawing sheet as one SVG string (docs/DESIGN.md §4.2 item 1, §5.5): the
// export counterpart of DrawingFigure + DimensionOverlay (src/components/drawings).
// Pure; src/lib/notify/drawing-png.ts renders it with resvg for the email
// attachment and the OG image. Units are the scene's centimetres; the chrome of
// the web figure (border, bar, labels, caption), which is in CSS pixels there,
// is scaled as if the figure's drawing were FIGURE_PX wide, so the proportions
// match the page.
import { caption, configCode } from "./format";
import { bedGeometry } from "./geometry";
import type { Resolved } from "./rules";
import { defToString, drawingScene, escapeAttr, INK, nodeToString, type SceneNode } from "./scene";

export interface SheetOptions {
  /** The code in the top bar; defaults to configCode(r). */
  code?: string;
  /** Prefix of every def id (the scene's patterns and the paper grid). Default "bed". */
  idPrefix?: string;
}

// Tokens (DESIGN §2.1) used by the figure.
const WHITE = "#FFFFFF";
const PAPER = "#FAFAF8";
const RULE = "#CFD0CC";
const INK_2 = "#4A4D52";
const GRID = "rgba(24,25,27,.05)";
const FONT = "DM Mono";
/** DM Mono's advance width: 600/1000 em for every glyph. */
const ADVANCE = 0.6;
/** Baseline offset that centres capitals and figures on a line: about half the cap height. */
const CAP_CENTRE = 0.35;

/** Width of the drawing in the web figure, in CSS px, at which the chrome has these sizes. */
const FIGURE_PX = 640;
const BAR_TEXT = "Desen la scară · vedere din față";
/** The scale bar is 50 cm long (§5.5). */
const SCALE_CM = 50;
/** The height dimension's column to the right of the drawing (§4.2), in figure px. */
const COLUMN_PX = 40;

/** Numbers rounded to 3 decimals, like scene.ts. */
const n = (value: number) => Math.round(value * 1000) / 1000;

type AttrValue = string | number | undefined;

function attrs(pairs: Record<string, AttrValue>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeAttr(String(v))}"`)
    .join("");
}

function text(content: string, a: Record<string, AttrValue>): string {
  return `<text${attrs({ "font-family": FONT, ...a })}>${escapeAttr(content)}</text>`;
}

/** Strokes in the scene are 1.5 CSS px (`vector-effect="non-scaling-stroke"`); resvg ignores that, so they are scaled to figure px here. */
function scaleStrokes(node: SceneNode, k: number): SceneNode {
  if (node.type === "group") return { ...node, children: node.children.map((child) => scaleStrokes(child, k)) };
  return node.strokeWidth === undefined ? node : { ...node, strokeWidth: n(node.strokeWidth * k) };
}

/**
 * The complete sheet: a white sheet with an ink border, the top bar („DESEN LA
 * SCARĂ · VEDERE DIN FAȚĂ” and the code), the drafting paper holding the scene,
 * the width dimension under the bed, the height dimension in the column to the
 * right, the scale bar bottom-left and the caption row under the paper.
 * Returns a root `<svg>` with viewBox, width and height in cm.
 */
export function sheetSvg(r: Resolved, opts: SheetOptions = {}): string {
  const prefix = opts.idPrefix ?? "bed";
  const code = opts.code ?? configCode(r);
  const g = bedGeometry(r);
  const { w: W, h: H, floor } = g.world;
  const scene = drawingScene(r, { idPrefix: prefix });

  // One figure px in cm.
  const px = W / FIGURE_PX;
  const border = 1.5 * px;
  const rule = 1 * px;
  const stroke = 1.5 * px;
  const padX = 14 * px;
  const padY = 10 * px;

  // Top bar: DM Mono 11px, line-height 1.4, uppercase, letter-spacing .08em.
  const barFs = 11 * px;
  const barH = padY * 2 + barFs * 1.4;
  // Caption row: 15px, line-height 1.5.
  const capFs = 15 * px;
  const capH = padY * 2 + capFs * 1.5;

  const ox = border;
  const oy = border + barH + rule;
  const paperW = W + COLUMN_PX * px;
  const SW = n(border + paperW + border);
  const SH = n(oy + H + rule + capH + border);

  const parts: string[] = [];

  // Sheet.
  parts.push(`<rect${attrs({ x: 0, y: 0, width: SW, height: SH, fill: WHITE })}/>`);

  // Bar.
  {
    const baseline = n(border + barH / 2 + CAP_CENTRE * barFs);
    const spacing = n(0.08 * barFs);
    parts.push(
      `<g data-role="bar">` +
        text(BAR_TEXT.toUpperCase(), {
          x: n(border + padX),
          y: baseline,
          "font-size": n(barFs),
          "letter-spacing": spacing,
          fill: INK,
        }) +
        text(code, {
          x: n(SW - border - padX),
          y: baseline,
          "font-size": n(barFs),
          "letter-spacing": spacing,
          "text-anchor": "end",
          fill: INK,
        }) +
        `<rect${attrs({ x: n(border), y: n(border + barH), width: n(paperW), height: n(rule), fill: RULE })}/>` +
        `</g>`,
    );
  }

  // Defs: the scene's, plus the paper grid (`.drafting`: a 1px line every 20 units).
  {
    const gridId = `${prefix}-grid`;
    const cell = 20;
    const grid =
      `<pattern${attrs({ id: gridId, x: n(ox), y: n(oy), width: cell, height: cell, patternUnits: "userSpaceOnUse" })}>` +
      `<rect${attrs({ x: 0, y: 0, width: cell, height: n(px), fill: GRID })}/>` +
      `<rect${attrs({ x: 0, y: 0, width: n(px), height: cell, fill: GRID })}/>` +
      `</pattern>`;
    parts.push(`<defs>${scene.defs.map(defToString).join("")}${grid}</defs>`);

    // Paper.
    const paper = { x: n(ox), y: n(oy), width: n(paperW), height: H };
    parts.push(
      `<g data-role="paper">` +
        `<rect${attrs({ ...paper, fill: PAPER })}/>` +
        `<rect${attrs({ ...paper, fill: `url(#${gridId})` })}/>` +
        `</g>`,
    );
  }

  // The drawing, at the paper's origin.
  parts.push(
    `<g data-role="drawing" transform="translate(${n(ox)} ${n(oy)})">` +
      scene.nodes.map((node) => nodeToString(scaleStrokes(node, px))).join("") +
      `</g>`,
  );

  // Width dimension: between dimWidth.x1 and x2, 14px high, its bottom 2.2% above the drawing's bottom.
  {
    const labelFs = 12 * px;
    const boxH = 14 * px;
    const bottom = oy + H - 0.022 * H;
    const top = bottom - boxH;
    const cy = (top + bottom) / 2;
    const x1 = ox + g.dimWidth.x1;
    const x2 = ox + g.dimWidth.x2;
    const cx = (x1 + x2) / 2;
    const label = g.dimWidth.label;
    const textW = label.length * ADVANCE * labelFs;
    const line = { stroke: INK, "stroke-width": n(stroke) };
    parts.push(
      `<g data-role="dim-width">` +
        `<line${attrs({ x1: n(x1 + stroke / 2), y1: n(top), x2: n(x1 + stroke / 2), y2: n(bottom), ...line })}/>` +
        `<line${attrs({ x1: n(x2 - stroke / 2), y1: n(top), x2: n(x2 - stroke / 2), y2: n(bottom), ...line })}/>` +
        `<line${attrs({ x1: n(x1), y1: n(cy), x2: n(x2), y2: n(cy), ...line })}/>` +
        `<rect${attrs({
          x: n(cx - textW / 2 - 10 * px),
          y: n(cy - 8 * px),
          width: n(textW + 20 * px),
          height: n(16 * px),
          fill: PAPER,
        })}/>` +
        text(label, { x: n(cx), y: n(cy + CAP_CENTRE * labelFs), "font-size": n(labelFs), "text-anchor": "middle", fill: INK }) +
        `</g>`,
    );
  }

  // Height dimension: in the column, from the floor up to floor + hb, 16px wide, label reading upwards.
  {
    const labelFs = 12 * px;
    const boxW = 16 * px;
    const cx = ox + W + (COLUMN_PX * px) / 2;
    const bottom = oy + H - floor;
    const top = bottom - (g.dimHeight.y2 - g.dimHeight.y1);
    const cy = (top + bottom) / 2;
    const label = g.dimHeight.label;
    const textW = label.length * ADVANCE * labelFs;
    const line = { stroke: INK, "stroke-width": n(stroke) };
    parts.push(
      `<g data-role="dim-height">` +
        `<line${attrs({ x1: n(cx - boxW / 2), y1: n(top + stroke / 2), x2: n(cx + boxW / 2), y2: n(top + stroke / 2), ...line })}/>` +
        `<line${attrs({ x1: n(cx - boxW / 2), y1: n(bottom - stroke / 2), x2: n(cx + boxW / 2), y2: n(bottom - stroke / 2), ...line })}/>` +
        `<line${attrs({ x1: n(cx), y1: n(top), x2: n(cx), y2: n(bottom), ...line })}/>` +
        `<rect${attrs({
          x: n(cx - 8 * px),
          y: n(cy - textW / 2 - 10 * px),
          width: n(16 * px),
          height: n(textW + 20 * px),
          fill: PAPER,
        })}/>` +
        text(label, {
          transform: `rotate(-90 ${n(cx)} ${n(cy)})`,
          x: n(cx),
          y: n(cy + CAP_CENTRE * labelFs),
          "font-size": n(labelFs),
          "text-anchor": "middle",
          fill: INK,
        }) +
        `</g>`,
    );
  }

  // Scale bar: 50 cm, 6px high with a 1px border, half filled; „0 — 50 cm” in 10px above it.
  {
    const fs = 10 * px;
    const left = ox + 0.015 * W;
    const barH = 6 * px;
    const bottom = oy + H - 0.032 * H;
    const top = bottom - barH;
    const bw = 1 * px;
    parts.push(
      `<g data-role="scale">` +
        text(`0 — ${SCALE_CM} cm`, { x: n(left), y: n(top - 3 * px - 0.22 * fs), "font-size": n(fs), fill: INK }) +
        `<rect${attrs({ x: n(left + bw), y: n(top + bw), width: n((SCALE_CM - 2 * bw) / 2), height: n(barH - 2 * bw), fill: INK })}/>` +
        `<rect${attrs({
          x: n(left + bw / 2),
          y: n(top + bw / 2),
          width: n(SCALE_CM - bw),
          height: n(barH - bw),
          fill: "none",
          stroke: INK,
          "stroke-width": n(bw),
        })}/>` +
        `</g>`,
    );
  }

  // Caption row: a rule, then the §5.6 caption in ink-2, shrunk when it would overflow the sheet.
  {
    const label = caption(r);
    const maxW = SW - 2 * border - 2 * padX;
    const fs = Math.min(capFs, maxW / (label.length * ADVANCE));
    const rowTop = oy + H + rule;
    parts.push(
      `<g data-role="caption">` +
        `<rect${attrs({ x: n(border), y: n(oy + H), width: n(paperW), height: n(rule), fill: RULE })}/>` +
        text(label, { x: n(border + padX), y: n(rowTop + capH / 2 + CAP_CENTRE * fs), "font-size": n(fs), fill: INK_2 }) +
        `</g>`,
    );
  }

  // Border, on top of everything.
  parts.push(
    `<rect${attrs({
      x: n(border / 2),
      y: n(border / 2),
      width: n(SW - border),
      height: n(SH - border),
      fill: "none",
      stroke: INK,
      "stroke-width": n(border),
    })}/>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}">` +
    parts.join("") +
    `</svg>`
  );
}
