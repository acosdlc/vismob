import { BedLineArt } from "@/components/drawings/BedLineArt";
import { Button } from "@/components/site/Button";
import { SectionHeader } from "@/components/site/SectionHeader";
import type { Catalog, ModelId } from "@/lib/configurator/types";
import { formatPrice } from "@/lib/configurator/format";
import { Section } from "./Section";

// DESIGN §4.1, 02 — Modele, in the order of its table; cards per §3.9.
const DESCRIPTIONS: Record<ModelId, string> = {
  capitonat: "Tăblie tapițată, cu nasturi îmbrăcați în același material. Clasic, merge în orice cameră.",
  arcuit: "Linie curbă, tapițerie netedă și bordură cusută. Arată cel mai bine în bouclé și catifea.",
  lamele: "Tăblie din lamele de lemn masiv, finisată cu ulei. Pentru cine vrea lemn, nu stofă.",
  canale: "Tapițerie cusută în canale verticale. Modern și înalt, potrivit pentru tavane înalte.",
};
const ORDER: ModelId[] = ["capitonat", "arcuit", "lamele", "canale"];

export function Models({
  catalog,
  showPrices,
  startingPrices = {},
}: {
  catalog: Catalog;
  showPrices: boolean;
  /** „de la … lei” per model, from the price grid (PR-5). */
  startingPrices?: Partial<Record<ModelId, number>>;
}) {
  const models = ORDER.map((id) => catalog.models.find((m) => m.id === id)).filter(
    (m): m is NonNullable<typeof m> => Boolean(m),
  );
  return (
    <Section id="modele" rule>
      <SectionHeader
        eyebrow="02 — Modele"
        title="Patru modele de pornire. Fiecare se adaptează."
        aside="Schimbi dimensiunea, înălțimea tăbliei, materialul și baza. Dacă ai o idee proprie, o desenăm de la zero."
      />
      <ul className="mt-[clamp(32px,4vw,56px)] grid list-none grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-[clamp(12px,2vw,24px)] p-0">
        {models.map((m) => {
          const price = startingPrices[m.id];
          return (
            <li key={m.id} className="flex flex-col border border-rule bg-card">
              <div className="aspect-[4/3] border-b border-rule bg-paper-2">
                <BedLineArt model={m.id} className="h-full w-full" idPrefix={`model-${m.id}`} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-[clamp(14px,1.8vw,22px)]">
                <h3 className="text-[19px] font-semibold leading-[1.25]">{m.name}</h3>
                <p className="text-[15px] text-ink-2">{m.description ?? DESCRIPTIONS[m.id]}</p>
                {showPrices && price !== undefined && (
                  <p className="mono-12 mt-auto text-muted">de la {formatPrice(price)} · 160 × 200</p>
                )}
                <div className={showPrices && price !== undefined ? "" : "mt-auto"}>
                  <Button href={`/configurator?m=${m.id}`} variant="link">
                    Configurează
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
