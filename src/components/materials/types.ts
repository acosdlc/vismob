import type { Catalog } from "@/lib/configurator/types";
import type { Settings } from "@/lib/data/settings.seed";
import type { SampleItem } from "@/lib/materials/samples";

// Shared contracts of the materials page (docs/DESIGN.md §4.3, §3.10; docs/PLAN.md PR-4).
// The page is static; the sample box lives in the browser (localStorage `mostre:v1`,
// read after mount) and its form posts the chosen ids to the `submitSamples` action.
// Two builders work on disjoint files; these types are the agreement between them.

/** What the client root needs from `settings`; nothing else reaches the browser. */
export type MaterialsSettings = Pick<
  Settings,
  "sample_limit" | "samples_free" | "samples_delivery" | "leg_height_cm" | "oil_refresh_interval"
>;

export interface MaterialsBrowserProps {
  catalog: Catalog;
  settings: MaterialsSettings;
}

/** One colour of the catalogue as the box and the tiles see it (src/lib/materials/samples.ts). */
export type { SampleItem };

/** localStorage key of the box (DESIGN §4.3). The value is `{ "ids": string[] }`. */
export const SAMPLE_BOX_STORAGE_KEY = "mostre:v1";

/** The box's state and actions (hook `useSampleBox(limit, validIds)` in sample-box-store.ts). */
export interface SampleBoxApi {
  /** Chosen Color.ids, in the order they were added. */
  ids: string[];
  limit: number;
  isFull: boolean;
  /** True once the stored box was read after mount; before that the box renders empty. */
  hydrated: boolean;
  has(id: string): boolean;
  /** False when the box is full or already holds the id. */
  add(id: string): boolean;
  remove(id: string): void;
  clear(): void;
}

/** The state of a tile (DESIGN §3.10): „+ adaugă mostra” / „în cutie · {cod}” / „cutia e plină”. */
export type SwatchTileState = "add" | "in-box" | "full";

export interface SwatchTileProps {
  item: SampleItem;
  state: SwatchTileState;
  onToggle: (id: string) => void;
}

export interface SampleBoxProps {
  /** The chosen items, in box order (the root derives them from `box.ids` and the catalogue). */
  items: SampleItem[];
  box: SampleBoxApi;
  settings: MaterialsSettings;
}

/** The hidden input of the samples form: a JSON array of Color.ids, in box order. */
export const SAMPLES_FIELDS = {
  ids: "sampleIds",
} as const;

/* Server Action (src/actions/submit-samples.ts), for reference:
   submitSamples(prev: FormState, formData: FormData): Promise<FormState>
   → on success { status: "ok", leadId }. The server keeps only ids that exist in the
     catalogue, 1 … settings.sample_limit of them. */
