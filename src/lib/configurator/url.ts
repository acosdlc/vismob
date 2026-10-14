// Configuration in the query string (docs/DESIGN.md §5.3, docs/ARHITECTURA.md §7).
import type { Config } from "./types";
import { DEFAULT_CONFIG } from "./catalog.seed";

/** Reads the configuration from the query string. Invalid values are repaired by resolve(). */
export function configFromParams(sp: URLSearchParams): Config {
  const num = (k: string, d: number) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    model: (sp.get("m") ?? DEFAULT_CONFIG.model) as Config["model"],
    size: (sp.get("s") ?? DEFAULT_CONFIG.size) as Config["size"],
    customW: num("w", DEFAULT_CONFIG.customW),
    customL: num("l", DEFAULT_CONFIG.customL),
    family: (sp.get("f") ?? DEFAULT_CONFIG.family) as Config["family"],
    color: sp.get("c") ?? DEFAULT_CONFIG.color,
    hb: num("h", DEFAULT_CONFIG.hb) as Config["hb"],
    base: (sp.get("b") ?? DEFAULT_CONFIG.base) as Config["base"],
    led: sp.get("led") === "1",
    nightstands: sp.get("n") === "1",
  };
}

export function paramsFromConfig(c: Config): URLSearchParams {
  const sp = new URLSearchParams({ m: c.model, s: c.size, f: c.family, c: c.color, h: String(c.hb), b: c.base });
  if (c.size === "custom") {
    sp.set("w", String(c.customW));
    sp.set("l", String(c.customL));
  }
  if (c.led) sp.set("led", "1");
  if (c.nightstands) sp.set("n", "1");
  return sp;
}
