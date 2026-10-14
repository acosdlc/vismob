import { bedGeometry, type Resolved } from "@/lib/configurator";
import { DimensionLine } from "@/components/site/DimensionLine";

export interface DimensionOverlayProps {
  resolved: Resolved;
}

/** The drafting paper behind the labels (DESIGN §2.4 `.drafting`, §5.5 „pe fundalul #FAFAF8”). */
const PAPER = "#FAFAF8";
/** The scale bar is 50 cm long (§5.5). */
const SCALE_CM = 50;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

// DESIGN §5.5: HTML dimension lines and the scale bar laid over the SVG, positioned in
// percentages of the world so the text stays 12px at any width. The parent is the
// aspect-ratio box of the drawing; the height dimension sits in the 40px column to its
// right (`-right-10`), which the figure reserves with padding. Decorative (aria-hidden):
// the values are in the figcaption and the ticket.
export function DimensionOverlay({ resolved }: DimensionOverlayProps) {
  const g = bedGeometry(resolved);
  const { w: W, h: H, floor } = g.world;
  const { x1, x2 } = g.dimWidth;
  const hb = g.dimHeight.y2 - g.dimHeight.y1;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-ink">
      {/* width: from dimWidth.x1 to x2, bottom 2.2%, 14px high */}
      <DimensionLine
        label={g.dimWidth.label}
        orientation="horizontal"
        background={PAPER}
        className="absolute bottom-[2.2%] h-[14px]!"
        style={{ left: pct(x1, W), width: pct(x2 - x1, W) }}
      />

      {/* height: in the 40px column on the right, from the floor to floor + hb */}
      <div className="absolute top-0 bottom-0 -right-10 w-10">
        <DimensionLine
          label={g.dimHeight.label}
          orientation="vertical"
          background={PAPER}
          className="absolute left-1/2 -translate-x-1/2"
          style={{ bottom: pct(floor, H), height: pct(hb, H) }}
        />
      </div>

      {/* scale: a 50 cm bar, half filled, „0 — 50 cm” in DM Mono 10px */}
      <div
        className="absolute bottom-[3.2%] left-[1.5%] flex flex-col gap-[3px]"
        style={{ width: pct(SCALE_CM, W) }}
        data-scale
      >
        <span className="font-mono text-[10px] leading-none whitespace-nowrap">0 — {SCALE_CM} cm</span>
        <span className="flex h-[6px] border border-ink">
          <span className="h-full w-1/2 bg-ink" />
        </span>
      </div>
    </div>
  );
}
