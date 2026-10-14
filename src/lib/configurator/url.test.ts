// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { resolve } from "./rules";
import type { Config } from "./types";
import { configFromParams, paramsFromConfig } from "./url";

describe("paramsFromConfig", () => {
  it("writes the DESIGN §5.3 parameters and nothing optional for the default", () => {
    expect(paramsFromConfig(DEFAULT_CONFIG).toString()).toBe("m=capitonat&s=160&f=catifea&c=ct-verde&h=120&b=lemn");
  });

  it("adds w and l only for custom, led and n only when checked", () => {
    const custom: Config = {
      ...DEFAULT_CONFIG,
      size: "custom",
      customW: 185,
      customL: 210,
      base: "lada",
      led: true,
      nightstands: true,
    };
    const sp = paramsFromConfig(custom);
    expect(sp.get("w")).toBe("185");
    expect(sp.get("l")).toBe("210");
    expect(sp.get("led")).toBe("1");
    expect(sp.get("n")).toBe("1");
    expect(sp.get("b")).toBe("lada");
    expect(paramsFromConfig({ ...DEFAULT_CONFIG, customW: 185 }).has("w")).toBe(false);
  });
});

describe("configFromParams", () => {
  it("round-trips the default configuration", () => {
    expect(configFromParams(paramsFromConfig(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
  });

  it("round-trips a custom configuration", () => {
    const custom: Config = {
      model: "lamele",
      size: "custom",
      customW: 185,
      customL: 210,
      family: "lemn",
      color: "lm-nuc",
      hb: 140,
      base: "sertare",
      led: true,
      nightstands: true,
    };
    expect(configFromParams(paramsFromConfig(custom))).toEqual(custom);
  });

  it("returns the default configuration for an empty query", () => {
    expect(configFromParams(new URLSearchParams())).toEqual(DEFAULT_CONFIG);
  });

  it("invalid numbers fall back to the defaults", () => {
    const c = configFromParams(new URLSearchParams("s=custom&w=abc&l=-5&h=foo&led=yes&n=0"));
    expect(c.customW).toBe(DEFAULT_CONFIG.customW);
    expect(c.customL).toBe(DEFAULT_CONFIG.customL);
    expect(c.hb).toBe(DEFAULT_CONFIG.hb);
    expect(c.led).toBe(false);
    expect(c.nightstands).toBe(false);
  });

  it("reads the DESIGN §5.3 example", () => {
    const c = configFromParams(new URLSearchParams("m=capitonat&s=160&f=catifea&c=ct-verde&h=120&b=lada&led=1"));
    expect(c).toEqual({ ...DEFAULT_CONFIG, base: "lada", led: true });
  });

  it("leaves unknown ids to resolve()", () => {
    const c = configFromParams(new URLSearchParams("m=xyz&s=170&f=xyz&c=xyz&h=130&b=xyz"));
    const r = resolve(c, SEED_CATALOG);
    expect(r.cfg).toEqual(DEFAULT_CONFIG);
  });
});
