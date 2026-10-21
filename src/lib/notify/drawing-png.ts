import "server-only";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { configCode } from "@/lib/configurator/format";
import type { Resolved } from "@/lib/configurator/rules";
import { sheetSvg } from "@/lib/configurator/sheet";
import { dmMonoRegular } from "./dm-mono";

// The drawing sheet (src/lib/configurator/sheet.ts) rendered to PNG with
// @resvg/resvg-js, for the email attachment (ARHITECTURA §6.4) and the OG image.
// Node runtime only: resvg is a native addon (next.config.ts serverExternalPackages).

/** Width of the attached PNG, in pixels (ARHITECTURA §6.4). */
export const DRAWING_PNG_WIDTH = 1600;

export interface DrawingPngOptions {
  /** The configuration code shown on the sheet; defaults to configCode(r). */
  code?: string;
  /** Output width in pixels; defaults to DRAWING_PNG_WIDTH. */
  width?: number;
}

export interface DrawingAttachment {
  filename: string;
  content: Buffer;
}

const FONT_FAMILY = "DM Mono";

let fontFile: string | undefined;

/**
 * The embedded DM Mono (dm-mono.ts) as a file in the temp directory, written once
 * per process. The Node binding of resvg-js 2.6.2 loads custom fonts only from
 * paths (`fontFiles`; `fontBuffers` exists in its wasm build alone), and the TTF
 * under assets/ is not part of a serverless function's files, so the bytes come
 * from the module and land in os.tmpdir(), which Vercel functions can write.
 */
function dmMonoFontFile(): string {
  // turbopackIgnore: a computed path in an fs call makes Turbopack warn that it
  // traces the whole project into the function bundle; the path is under
  // os.tmpdir(), never under the project, so there is nothing to trace.
  if (fontFile && existsSync(/* turbopackIgnore: true */ fontFile)) return fontFile;
  const font = dmMonoRegular();
  const hash = createHash("sha256").update(font).digest("hex").slice(0, 16);
  const dir = join(tmpdir(), "vismob-fonts");
  const file = join(dir, `DMMono-Regular-${hash}.ttf`);
  if (!existsSync(/* turbopackIgnore: true */ file)) {
    mkdirSync(dir, { recursive: true });
    // Written next to its final name, then renamed, so another concurrent render
    // never reads a half-written file.
    const partial = `${file}.${process.pid}.${Date.now()}.part`;
    writeFileSync(partial, font);
    renameSync(partial, file);
  }
  fontFile = file;
  return file;
}

/**
 * The sheet of `r` as a PNG `width` pixels wide (the height follows the sheet's
 * proportions). Rendered with the synchronous `Resvg` (about 100 ms): the
 * `renderAsync` variant runs on the thread pool, which the build's prerender of
 * /opengraph-image counts as request-time work and makes the route dynamic.
 */
export async function renderDrawingPng(r: Resolved, opts: DrawingPngOptions = {}): Promise<Buffer> {
  const svg = sheetSvg(r, { code: opts.code });
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: opts.width ?? DRAWING_PNG_WIDTH },
    font: { fontFiles: [dmMonoFontFile()], loadSystemFonts: false, defaultFontFamily: FONT_FAMILY },
  }).render();
  return image.asPng();
}

/** The email attachment: `desen-{code}.png` with the sheet at DRAWING_PNG_WIDTH. */
export async function drawingAttachment(r: Resolved, code: string = configCode(r)): Promise<DrawingAttachment> {
  return { filename: `desen-${code}.png`, content: await renderDrawingPng(r, { code }) };
}
