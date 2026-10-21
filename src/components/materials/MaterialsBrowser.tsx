"use client";

import { useMemo, useState } from "react";
import type { Catalog } from "@/lib/configurator/types";
import { swatchItems } from "@/lib/materials/swatches";
import { BASE_CARDS, BasesCards } from "./BasesCards";
import { FamilyArticle } from "./FamilyArticle";
import { MaterialsTabs, type MaterialsTab, type MaterialsTabId } from "./MaterialsTabs";
import type { MaterialsBrowserProps } from "./types";
import { WoodFinishes } from "./WoodFinishes";

// DESIGN §4.3 body: the three tabs over the family articles, the wood finishes and the
// bases cards, on the full width. Only the tab state lives here; every swatch is a link.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The three tabs with their counters, computed from the catalogue (DESIGN §4.3). */
export function materialsTabs(catalog: Catalog): MaterialsTab[] {
  const textile = catalog.families.filter((f) => f.tab === "textile");
  const wood = catalog.families.filter((f) => f.tab === "lemn");
  const species = wood.reduce((n, f) => n + f.colors.length, 0);
  return [
    { id: "textile", label: "Textile", count: plural(textile.length, "familie", "familii") },
    { id: "lemn", label: "Lemn masiv", count: plural(species, "esență", "esențe") },
    { id: "baze", label: "Picioare și baze", count: String(BASE_CARDS.length) },
  ];
}

export function MaterialsBrowser({ catalog, settings }: MaterialsBrowserProps) {
  const items = useMemo(() => swatchItems(catalog), [catalog]);
  const [tab, setTab] = useState<MaterialsTabId>("textile");
  const tabs = materialsTabs(catalog);
  const families = catalog.families.filter((f) => (tab === "lemn" ? f.tab === "lemn" : f.tab === "textile"));

  return (
    <div className="pb-[clamp(48px,6vw,80px)]">
      <MaterialsTabs tabs={tabs} active={tab} onChange={setTab} focusablePanel={tab !== "baze"}>
        {tab === "baze" ? (
          <BasesCards bases={catalog.bases} legHeightCm={settings.leg_height_cm} />
        ) : (
          <>
            {families.map((family) => (
              <FamilyArticle key={family.id} family={family} items={items.filter((item) => item.familyId === family.id)} />
            ))}
            {tab === "lemn" && <WoodFinishes oilRefreshInterval={settings.oil_refresh_interval} />}
          </>
        )}
      </MaterialsTabs>
    </div>
  );
}
