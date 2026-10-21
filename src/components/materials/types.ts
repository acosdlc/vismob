import type { Catalog } from "@/lib/configurator/types";
import type { Settings } from "@/lib/data/settings.seed";
import type { SwatchItem } from "@/lib/materials/swatches";

// Shared contracts of the materials page (docs/DESIGN.md §4.3, §3.10). The page is
// static; only the tabs hold state in the browser. Every swatch is a link to the
// configurator with that colour preselected.

/** What the client root needs from `settings`; nothing else reaches the browser. */
export type MaterialsSettings = Pick<Settings, "leg_height_cm" | "oil_refresh_interval">;

export interface MaterialsBrowserProps {
  catalog: Catalog;
  settings: MaterialsSettings;
}

export type { SwatchItem };

export interface SwatchTileProps {
  item: SwatchItem;
  /** Where the tile leads (configuratorHref). */
  href: string;
}
