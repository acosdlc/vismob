// Configurator rules (docs/DESIGN.md §5.2). Pure: the same function runs in
// the browser and on the server, where it is the source of truth.
import type { Base, Catalog, Color, Config, Family, Model } from "./types";
import { CUSTOM_L, CUSTOM_W } from "./catalog.seed";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const SIZE_KEYS = ["90", "120", "140", "160", "180", "200", "custom"] as const;
const HB_VALUES = [100, 120, 140] as const;

export interface Resolved {
  cfg: Config;
  model: Model;
  family: Family;
  color: Color;
  base: Base;
  /** Mattress size, cm. */
  w: number;
  l: number;
}

/** Applies the rules and returns a valid configuration (the same function runs on the server). */
export function resolve(input: Config, cat: Catalog): Resolved {
  const model = cat.models.find((m) => m.id === input.model) ?? cat.models[0];
  if (!model) {
    throw new Error("Configurator catalog has no models.");
  }
  const familyId = model.families.includes(input.family) ? input.family : model.families[0];
  const family = cat.families.find((f) => f.id === familyId);
  if (!family) {
    throw new Error(
      `Configurator catalog: model "${model.id}" allows family "${familyId}", but the catalog has no such family.`,
    );
  }
  const color = family.colors.find((c) => c.id === input.color) ?? family.colors[0];
  if (!color) {
    throw new Error(`Configurator catalog: family "${family.id}" has no colors.`);
  }
  const base = cat.bases.find((b) => b.id === input.base) ?? cat.bases[0];
  if (!base) {
    throw new Error("Configurator catalog has no bases.");
  }
  const size = SIZE_KEYS.includes(input.size) ? input.size : "160";
  const custom = size === "custom";
  const w = custom ? clamp(Math.round(input.customW) || 150, CUSTOM_W.min, CUSTOM_W.max) : Number(size);
  const l = custom ? clamp(Math.round(input.customL) || 200, CUSTOM_L.min, CUSTOM_L.max) : 200;
  const hb = HB_VALUES.includes(input.hb) ? input.hb : 120;
  return {
    cfg: { ...input, size, model: model.id, family: family.id, color: color.id, base: base.id, hb },
    model,
    family,
    color,
    base,
    w,
    l,
  };
}
