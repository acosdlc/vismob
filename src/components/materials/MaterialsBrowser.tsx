"use client";

import { useMemo, useRef, useState } from "react";
import { SampleBox } from "@/components/materials/SampleBox";
import { SampleBoxButton } from "@/components/materials/SampleBoxButton";
import { useSampleBox } from "@/components/materials/sample-box-store";
import type { Catalog } from "@/lib/configurator/types";
import { sampleItems } from "@/lib/materials/samples";
import { BASE_CARDS, BasesCards } from "./BasesCards";
import { FamilyArticle } from "./FamilyArticle";
import { MaterialsTabs, type MaterialsTab, type MaterialsTabId } from "./MaterialsTabs";
import type { MaterialsBrowserProps, SampleBoxApi, SampleItem, SwatchTileState } from "./types";
import { WoodFinishes } from "./WoodFinishes";

// DESIGN §4.3 body: the content (flex 3 1 640px) and the sample box (flex 1 1 300px, sticky
// at ≥960px, under the content on mobile). The tab state lives here; the box state in
// useSampleBox (localStorage, read after mount, so the box is empty before hydration).
// §7: a visually hidden aria-live region announces „{nume} adăugată în cutie” (and the
// removal, from a tile or from the box's own button). The header is sticky too (76px), so
// the box sticks 16px under it, not under the viewport's edge.

/** Sticky offset at ≥960px: the header's 76px plus DESIGN's 16px. */
const STICKY_TOP = "nav:top-[92px]";

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
  const items = useMemo(() => sampleItems(catalog), [catalog]);
  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const box = useSampleBox(settings.sample_limit, allIds);
  const [tab, setTab] = useState<MaterialsTabId>("textile");
  // Keyed, so the same text twice in a row (add, remove from the box, add again) still
  // replaces the live region's node and gets read.
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  const announce = (text: string) => setAnnouncement((a) => ({ text, n: a.n + 1 }));
  const boxRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const chosen = box.ids.map((id) => byId.get(id)).filter((item): item is SampleItem => Boolean(item));

  const stateOf = (id: string): SwatchTileState => (box.has(id) ? "in-box" : box.isFull ? "full" : "add");

  function remove(id: string) {
    const item = byId.get(id);
    box.remove(id);
    if (item) announce(`${item.name} scoasă din cutie`);
  }

  function onToggle(id: string) {
    const item = byId.get(id);
    if (!item) return;
    if (box.has(id)) {
      remove(id);
    } else if (box.add(id)) {
      announce(`${item.name} adăugată în cutie`);
    }
  }

  // The box's own „Scoate {nume}” buttons announce the removal the same way.
  const announcingBox: SampleBoxApi = { ...box, remove };

  const tabs = materialsTabs(catalog);
  const families = catalog.families.filter((f) => (tab === "lemn" ? f.tab === "lemn" : f.tab === "textile"));

  return (
    <div className="flex flex-wrap items-start gap-[clamp(24px,3vw,48px)] pb-[clamp(48px,6vw,80px)]">
      <div className="min-w-0 flex-[3_1_640px]">
        <MaterialsTabs tabs={tabs} active={tab} onChange={setTab}>
          {tab === "baze" ? (
            <BasesCards bases={catalog.bases} legHeightCm={settings.leg_height_cm} />
          ) : (
            <>
              {families.map((family) => (
                <FamilyArticle
                  key={family.id}
                  family={family}
                  items={items.filter((item) => item.familyId === family.id)}
                  stateOf={stateOf}
                  onToggle={onToggle}
                />
              ))}
              {tab === "lemn" && <WoodFinishes oilRefreshInterval={settings.oil_refresh_interval} />}
            </>
          )}
        </MaterialsTabs>
      </div>

      <div id="cutie" ref={boxRef} className={`min-w-0 flex-[1_1_300px] nav:sticky ${STICKY_TOP}`}>
        <SampleBox items={chosen} box={announcingBox} settings={settings} />
      </div>
      <SampleBoxButton count={box.ids.length} targetRef={boxRef} />

      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="box-announcer">
        <span key={announcement.n}>{announcement.text}</span>
      </div>
    </div>
  );
}
