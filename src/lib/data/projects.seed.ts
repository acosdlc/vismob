// Portfolio seed. In production the rows come from `projects` + `project_photos`
// (PR-5) and the real projects arrive in PR-7. Until then these placeholders
// hold only docs/DESIGN.md strings: the §8 FOTO frames, the §3.6 ticket
// placeholders and captions built from the §3.4 template
// „[Model] · [160 × 200] · [material, culoare] · [oraș]”. Nothing is invented.
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { ModelId } from "@/lib/configurator/types";

export interface ProjectPhoto {
  /** Absent while the workshop has not delivered the photo: the FOTO box shows instead. */
  src?: string;
  /** „FOTO NN” label in the placeholder box (DESIGN §3.4). */
  label: string;
  /** The frame description from DESIGN §8. */
  frame: string;
}

export interface Project {
  slug: string;
  /** „Nr. [___]” on the ticket (DESIGN §3.6). */
  ticketNo: string;
  /** The gallery caption (DESIGN §3.4 template) until the workshop names the project. */
  title: string;
  modelId: ModelId;
  widthCm: number;
  lengthCm: number;
  /** „Catifea, verde sticlă” */
  materialLabel: string;
  /** „Ladă de depozitare” */
  baseLabel: string;
  /** „LED sub pat”, „2 noptiere” */
  extras: string[];
  city: string;
  /** „Livrat [Oraș, lună an]” */
  deliveredLabel: string;
  photo?: ProjectPhoto;
  /** Shown on Acasă 05 (six tiles). */
  featured: boolean;
  /** The project in the hero (FOTO 01 + ticket). */
  hero: boolean;
}

// DESIGN §8, „Lista de poze”.
const FRAME_01 = "Pat finalizat, în dormitorul unui client. Lumină naturală, cadru orizontal, fără blitz.";
const FRAME_WHOLE_BED = "Paturi întregi, în cameră, din față sau din 3/4";
const FRAME_04 = "Detaliu de tăblie: cusături, nasturi, colțuri";
const FRAME_05 = "Pat cu ladă, cu somiera ridicată";
const FRAME_07 = "Proiect atipic: mansardă, nișă, pat de copil";

// DESIGN §3.6 and §3.4 placeholders.
const TICKET_NO = "[___]";
const MATERIAL = "[material, culoare]";
const DELIVERED = "[Oraș, lună an]";

const BASE_LEGS = SEED_CATALOG.bases[0].name; // „Picioare din lemn” (DEFAULT_CONFIG.base)
const BASE_LADA = SEED_CATALOG.bases[2].name; // „Ladă de depozitare”

function modelName(id: ModelId): string {
  const model = SEED_CATALOG.models.find((m) => m.id === id);
  if (!model) throw new Error(`projects.seed: unknown model "${id}".`);
  return model.name;
}

/** The DESIGN §3.4 caption: „[Model] · [160 × 200] · [material, culoare] · [oraș]”. */
export function projectCaption(p: Pick<Project, "modelId" | "widthCm" | "lengthCm" | "materialLabel" | "city">): string {
  return `${modelName(p.modelId)} · ${p.widthCm} × ${p.lengthCm} · ${p.materialLabel} · ${p.city}`;
}

interface PlaceholderInput {
  slug: string;
  modelId: ModelId;
  widthCm: number;
  lengthCm: number;
  baseLabel: string;
  city: string;
  photo: ProjectPhoto;
  featured: boolean;
  hero: boolean;
}

function placeholder(input: PlaceholderInput): Project {
  const { photo, ...rest } = input;
  return {
    ...rest,
    ticketNo: TICKET_NO,
    title: projectCaption({ ...rest, materialLabel: MATERIAL }),
    materialLabel: MATERIAL,
    extras: [],
    deliveredLabel: DELIVERED,
    photo,
  };
}

export const SEED_PROJECTS: Project[] = [
  // Hero (DESIGN §4.1 Hero, §3.6): FOTO 01 with the ticket in its corner.
  placeholder({
    slug: "foto-01",
    modelId: "capitonat",
    widthCm: 180,
    lengthCm: 200,
    baseLabel: BASE_LADA,
    city: "[Oraș]",
    photo: { label: "FOTO 01", frame: FRAME_01 },
    featured: false,
    hero: true,
  }),
  // Acasă 05 — Lucrări: six featured tiles, frames FOTO 02–07 (DESIGN §4.1, §8).
  placeholder({
    slug: "foto-02",
    modelId: "capitonat",
    widthCm: 160,
    lengthCm: 200,
    baseLabel: BASE_LEGS,
    city: "[oraș]",
    photo: { label: "FOTO 02", frame: FRAME_WHOLE_BED },
    featured: true,
    hero: false,
  }),
  placeholder({
    slug: "foto-03",
    modelId: "arcuit",
    widthCm: 160,
    lengthCm: 200,
    baseLabel: BASE_LEGS,
    city: "[oraș]",
    photo: { label: "FOTO 03", frame: FRAME_WHOLE_BED },
    featured: true,
    hero: false,
  }),
  placeholder({
    slug: "foto-04",
    modelId: "canale",
    widthCm: 160,
    lengthCm: 200,
    baseLabel: BASE_LEGS,
    city: "[oraș]",
    photo: { label: "FOTO 04", frame: FRAME_04 },
    featured: true,
    hero: false,
  }),
  placeholder({
    slug: "foto-05",
    modelId: "lamele",
    widthCm: 160,
    lengthCm: 200,
    baseLabel: BASE_LADA,
    city: "[oraș]",
    photo: { label: "FOTO 05", frame: FRAME_05 },
    featured: true,
    hero: false,
  }),
  placeholder({
    slug: "foto-06",
    modelId: "capitonat",
    widthCm: 160,
    lengthCm: 200,
    baseLabel: BASE_LEGS,
    city: "[oraș]",
    photo: { label: "FOTO 06", frame: FRAME_WHOLE_BED },
    featured: true,
    hero: false,
  }),
  placeholder({
    slug: "foto-07",
    modelId: "arcuit",
    widthCm: 160,
    lengthCm: 200,
    baseLabel: BASE_LEGS,
    city: "[oraș]",
    photo: { label: "FOTO 07", frame: FRAME_07 },
    featured: true,
    hero: false,
  }),
];
