// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { caption, configCode, formatPrice, sizeLabel, ticketRows, whatsappText, whatsappUrl } from "./format";
import { resolve } from "./rules";
import type { Config } from "./types";

const res = (patch: Partial<Config> = {}) => resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG);

describe("configCode", () => {
  it("builds MODEL-WxL-COLOR-Hhb-BASE", () => {
    expect(configCode(res())).toBe("CAP-160x200-CT01-H120-PL");
  });

  it("appends -LED and -N2", () => {
    expect(configCode(res({ base: "lada", led: true }))).toBe("CAP-160x200-CT01-H120-LD-LED");
    expect(configCode(res({ nightstands: true }))).toBe("CAP-160x200-CT01-H120-PL-N2");
    expect(configCode(res({ base: "lada", led: true, nightstands: true }))).toBe("CAP-160x200-CT01-H120-LD-LED-N2");
  });

  it("uses the resolved size and colour codes", () => {
    const r = res({
      model: "lamele",
      family: "lemn",
      color: "lm-nuc",
      size: "custom",
      customW: 185,
      customL: 210,
      hb: 140,
      base: "sertare",
    });
    expect(configCode(r)).toBe("LAM-185x210-LM03-H140-SR");
  });
});

describe("sizeLabel and caption", () => {
  it("formats the mattress size", () => {
    expect(sizeLabel(res())).toBe("160 × 200 cm");
  });

  it("writes the caption in lower case after the model name", () => {
    expect(caption(res())).toBe("Capitonat · catifea, verde sticlă · 160 × 200 cm · tăblie 120 cm · picioare din lemn");
    expect(caption(res({ model: "arcuit", family: "piele", color: "pe-coniac", hb: 100, base: "lada" }))).toBe(
      "Arcuit · piele ecologică, coniac · 160 × 200 cm · tăblie 100 cm · ladă de depozitare",
    );
  });
});

describe("ticketRows", () => {
  it("lists the six rows with Extra — when nothing is chosen", () => {
    expect(ticketRows(res())).toEqual([
      { k: "Model", v: "Capitonat" },
      { k: "Saltea", v: "160 × 200 cm" },
      { k: "Material", v: "Catifea, verde sticlă" },
      { k: "Tăblie", v: "120 cm de la podea" },
      { k: "Bază", v: "Picioare din lemn" },
      { k: "Extra", v: "—" },
    ]);
  });

  it("joins the extras", () => {
    expect(ticketRows(res({ led: true })).at(-1)).toEqual({ k: "Extra", v: "LED sub pat" });
    expect(ticketRows(res({ nightstands: true })).at(-1)).toEqual({ k: "Extra", v: "2 noptiere" });
    expect(ticketRows(res({ led: true, nightstands: true })).at(-1)).toEqual({ k: "Extra", v: "LED sub pat, 2 noptiere" });
  });
});

describe("whatsappText", () => {
  it("contains the code, the rows and the URL", () => {
    const url = "https://example.test/configurator?m=capitonat&s=160";
    const text = whatsappText(res({ led: true }), url);
    expect(text).toContain("CAP-160x200-CT01-H120-PL-LED");
    expect(text).toContain("Model: Capitonat; Saltea: 160 × 200 cm; Material: Catifea, verde sticlă;");
    expect(text).toContain("Extra: LED sub pat.");
    expect(text.endsWith(url)).toBe(true);
    expect(text.startsWith("Bună ziua! Aș vrea o ofertă pentru patul configurat pe site (")).toBe(true);
  });
});

describe("whatsappUrl", () => {
  it("keeps only the digits and encodes the text", () => {
    expect(whatsappUrl("+40 722-123 456", "Bună ziua! a&b")).toBe("https://wa.me/40722123456?text=Bun%C4%83%20ziua!%20a%26b");
    expect(whatsappUrl("40722123456", "x")).toBe("https://wa.me/40722123456?text=x");
  });

  it("returns null for fewer than 8 digits", () => {
    expect(whatsappUrl("1234567", "x")).toBeNull();
    expect(whatsappUrl("", "x")).toBeNull();
    expect(whatsappUrl("[07xx xxx xxx]", "x")).toBeNull();
    expect(whatsappUrl("12345678", "x")).toBe("https://wa.me/12345678?text=x");
  });
});

describe("formatPrice", () => {
  it("formats for ro-RO and appends lei", () => {
    expect(formatPrice(3450)).toBe("3.450 lei");
    expect(formatPrice(12345)).toBe("12.345 lei");
    expect(formatPrice(0)).toBe("0 lei");
  });
});
