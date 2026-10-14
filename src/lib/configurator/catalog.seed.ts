// Catalog seed (docs/DESIGN.md §5.1). In production the same shape is read
// from Supabase (PR-5); until then every page uses this file.
import type { Catalog, Config } from "./types";

const TEXTILE = ["catifea", "boucle", "stofa", "piele"] as const;

export const SEED_CATALOG: Catalog = {
  models: [
    { id: "capitonat", name: "Capitonat", note: "Tapițat, cu nasturi", code: "CAP", families: [...TEXTILE] },
    { id: "arcuit", name: "Arcuit", note: "Linie curbă, bordură", code: "ARC", families: [...TEXTILE] },
    { id: "canale", name: "Canale", note: "Cusături verticale", code: "CAN", families: [...TEXTILE] },
    { id: "lamele", name: "Lamele", note: "Lemn masiv", code: "LAM", families: ["lemn"] },
  ],
  families: [
    {
      id: "catifea",
      name: "Catifea",
      code: "CT",
      tab: "textile",
      colors: [
        { id: "ct-verde", name: "Verde sticlă", hex: "#2F4B3C", code: "CT01", featured: true },
        { id: "ct-bleumarin", name: "Bleumarin", hex: "#1F2A44", code: "CT02" },
        { id: "ct-mustar", name: "Muștar", hex: "#B98A2E", code: "CT03", featured: true },
        { id: "ct-roz", name: "Roz pudrat", hex: "#C99A93", code: "CT04" },
        { id: "ct-antracit", name: "Antracit", hex: "#3B3D41", code: "CT05" },
        { id: "ct-caramiziu", name: "Cărămiziu", hex: "#9A4E3A", code: "CT06" },
      ],
    },
    {
      id: "boucle",
      name: "Bouclé",
      code: "BC",
      tab: "textile",
      colors: [
        { id: "bc-alb", name: "Alb lapte", hex: "#E7E2D8", code: "BC01", featured: true },
        { id: "bc-nisip", name: "Nisip", hex: "#CDBFA6", code: "BC02", featured: true },
        { id: "bc-perla", name: "Gri perlă", hex: "#BDBAB4", code: "BC03" },
        { id: "bc-taupe", name: "Taupe", hex: "#8E8174", code: "BC04" },
      ],
    },
    {
      id: "stofa",
      name: "Stofă",
      code: "SF",
      tab: "textile",
      colors: [
        { id: "sf-gri", name: "Gri deschis", hex: "#B9BCBF", code: "SF01" },
        { id: "sf-melanj", name: "Gri melanj", hex: "#7B7E83", code: "SF02", featured: true },
        { id: "sf-denim", name: "Albastru denim", hex: "#4A5F7A", code: "SF03" },
        { id: "sf-salvie", name: "Verde salvie", hex: "#8F9E89", code: "SF04" },
        { id: "sf-bej", name: "Bej", hex: "#CBB99B", code: "SF05" },
      ],
    },
    {
      id: "piele",
      name: "Piele ecologică",
      code: "PE",
      tab: "textile",
      colors: [
        { id: "pe-coniac", name: "Coniac", hex: "#8A5A35", code: "PE01", featured: true },
        { id: "pe-ciocolata", name: "Ciocolată", hex: "#4A3328", code: "PE02" },
        { id: "pe-negru", name: "Negru", hex: "#232323", code: "PE03" },
        { id: "pe-alb", name: "Alb", hex: "#E9E6E0", code: "PE04" },
      ],
    },
    {
      id: "lemn",
      name: "Lemn masiv",
      code: "LM",
      tab: "lemn",
      colors: [
        { id: "lm-stejar", name: "Stejar natur", hex: "#C9A574", code: "LM01", featured: true },
        { id: "lm-afumat", name: "Stejar afumat", hex: "#7A5A3C", code: "LM02" },
        { id: "lm-nuc", name: "Nuc", hex: "#5C3F2C", code: "LM03", featured: true },
        { id: "lm-frasin", name: "Frasin", hex: "#D8C3A0", code: "LM04" },
        { id: "lm-negru", name: "Negru mat", hex: "#262626", code: "LM05" },
      ],
    },
  ],
  bases: [
    { id: "lemn", name: "Picioare din lemn", note: "Stejar, [12] cm", code: "PL" },
    { id: "metal", name: "Picioare metalice", note: "Negru mat, [12] cm", code: "PM" },
    { id: "lada", name: "Ladă de depozitare", note: "Somieră rabatabilă", code: "LD" },
    { id: "sertare", name: "Sertare", note: "2 sertare pe lateral", code: "SR" },
  ],
};

/** Standard mattress widths, × 200 cm. */
export const SIZES = ["90", "120", "140", "160", "180", "200"] as const;
export const HEIGHTS = [100, 120, 140] as const;
export const CUSTOM_W = { min: 80, max: 220 } as const;
export const CUSTOM_L = { min: 180, max: 220 } as const;

export const DEFAULT_CONFIG: Config = {
  model: "capitonat",
  size: "160",
  customW: 150,
  customL: 200,
  family: "catifea",
  color: "ct-verde",
  hb: 120,
  base: "lemn",
  led: false,
  nightstands: false,
};
