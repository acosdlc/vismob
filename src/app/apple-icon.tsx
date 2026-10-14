import { ImageResponse } from "next/og";

// Apple touch icon: the same mark as src/app/icon.svg (the capitonat headboard, frame and legs
// on the floor line, DESIGN §3.9) at 180px, in ink on drafting paper. Satori renders no SVG
// patterns, so the mark is built from positioned divs and borders. Generated at build time.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const INK = "#18191B";
const CARD = "#F7F7F4";
const DRAFTING = "#FAFAF8";
const STROKE = 8; // 1.5 units of the 32px mark, scaled ×5.625

const box = {
  position: "absolute" as const,
  boxSizing: "border-box" as const,
  display: "flex" as const,
};

const outlined = {
  ...box,
  border: `${STROKE}px solid ${INK}`,
  backgroundColor: CARD,
};

const dot = {
  ...box,
  width: 11,
  height: 11,
  borderRadius: 999,
  backgroundColor: INK,
};

/** Dot centres of the five buttons, as (cx, cy). */
const DOTS: Array<[number, number]> = [
  [70, 56],
  [110, 56],
  [90, 76],
  [70, 96],
  [110, 96],
];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: DRAFTING,
        }}
      >
        {/* floor */}
        <div style={{ ...box, left: 17, top: 148, width: 146, height: STROKE, backgroundColor: INK }} />
        {/* headboard, rounded at the top */}
        <div style={{ ...outlined, left: 45, top: 34, width: 90, height: 118, borderRadius: "12px 12px 0 0" }} />
        {/* buttons */}
        {DOTS.map(([cx, cy]) => (
          <div key={`${cx}-${cy}`} style={{ ...dot, left: cx - 5.5, top: cy - 5.5 }} />
        ))}
        {/* legs */}
        <div style={{ ...box, left: 42, top: 141, width: 11, height: 11, backgroundColor: INK }} />
        <div style={{ ...box, left: 127, top: 141, width: 11, height: 11, backgroundColor: INK }} />
        {/* frame */}
        <div style={{ ...outlined, left: 31, top: 110, width: 118, height: 31 }} />
      </div>
    ),
    { ...size },
  );
}
