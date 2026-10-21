import { ImageResponse } from "next/og";
import { DEFAULT_CONFIG, resolve, SEED_CATALOG } from "@/lib/configurator";
import { getSettings } from "@/lib/data/settings";
import { dmMonoRegularArrayBuffer } from "@/lib/notify/dm-mono";
import { renderDrawingPng } from "@/lib/notify/drawing-png";

// ARHITECTURA §10: the capitonat drawing on drafting paper and the workshop's
// name. The sheet is the one attached to the emails (src/lib/configurator/sheet.ts
// rendered by drawing-png.ts); Satori composes it with the name. Generated at
// build time: nothing here reads the request. Satori lays out with flexbox
// alone (every div with children needs display: flex), and only DM Mono is
// loaded, so the name is set in it too.
/** The figure's bar text (DESIGN §4.2 item 1); static, so the workshop's name cannot be part of it. */
export const alt = "Desen la scară · vedere din față";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#18191B";
const MUTED = "#5F6268";
const DRAFTING = "#FAFAF8";
const PAD = 56;
const GAP = 48;
/** The text column; the sheet takes the rest of the width. */
const TEXT_W = 384;
const EYEBROW_PX = 22;

/** Width and height from the PNG's IHDR chunk (always right after the signature). */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export default async function OpenGraphImage() {
  const settings = await getSettings();
  const png = await renderDrawingPng(resolve(DEFAULT_CONFIG, SEED_CATALOG), { width: size.width });
  const natural = pngSize(png);
  const scale = Math.min(
    (size.width - 2 * PAD - TEXT_W - GAP) / natural.width,
    (size.height - 2 * PAD) / natural.height,
  );
  const width = Math.round(natural.width * scale);
  const height = Math.round(natural.height * scale);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: PAD,
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: DRAFTING,
          color: INK,
          fontFamily: "DM Mono",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: TEXT_W, gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: EYEBROW_PX,
              lineHeight: 1.55,
              textTransform: "uppercase",
              letterSpacing: 0.08 * EYEBROW_PX,
              color: MUTED,
            }}
          >
            Paturi la comandă
          </div>
          <div style={{ display: "flex", fontSize: 54, lineHeight: 1.15 }}>{settings.workshop_name}</div>
        </div>
        <img src={`data:image/png;base64,${png.toString("base64")}`} width={width} height={height} alt="" />
      </div>
    ),
    { ...size, fonts: [{ name: "DM Mono", data: dmMonoRegularArrayBuffer(), weight: 400, style: "normal" }] },
  );
}
