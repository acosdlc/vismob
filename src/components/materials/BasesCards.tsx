import { Photo } from "@/components/site/Photo";
import type { Base, BaseId } from "@/lib/configurator/types";

// DESIGN §4.3, the tab „Picioare și baze”: three cards with a 4:3 photo. Until the photos
// arrive the box shows the §8 frame for „Picioare” („Picior din stejar, picior metalic, bază
// cu ladă”), one part per card. [12] comes from settings.leg_height_cm. The card for the
// floor base covers both storage bases of the catalogue (ladă, sertare); its photo is the
// first one of them that has one.

export interface BaseCard {
  id: "lemn" | "metal" | "podea";
  title: string;
  text: string;
  frame: string;
  /** The catalogue bases whose photo this card may use, in order of preference. */
  from: BaseId[];
}

/** The three cards of DESIGN §4.3; `text` takes settings.leg_height_cm. */
export const BASE_CARDS: readonly (Omit<BaseCard, "text"> & {
  text: (legHeightCm: string) => string;
})[] = [
  {
    id: "lemn",
    title: "Picioare din lemn",
    text: (legHeightCm) => `Stejar masiv, înălțime ${legHeightCm} cm, finisaj ca tăblia.`,
    frame: "Picior din stejar",
    from: ["lemn"],
  },
  {
    id: "metal",
    title: "Picioare metalice",
    text: (legHeightCm) => `Oțel vopsit negru mat, înălțime ${legHeightCm} cm.`,
    frame: "Picior metalic",
    from: ["metal"],
  },
  {
    id: "podea",
    title: "Bază până la podea",
    text: () => "Pentru ladă de depozitare sau sertare, cu plintă retrasă.",
    frame: "Bază cu ladă",
    from: ["lada", "sertare"],
  },
];

export function baseCards(legHeightCm: string): BaseCard[] {
  return BASE_CARDS.map((card) => ({ ...card, text: card.text(legHeightCm) }));
}

export interface BasesCardsProps {
  bases: Base[];
  /** settings.leg_height_cm, e.g. „[12]”. */
  legHeightCm: string;
}

export function BasesCards({ bases, legHeightCm }: BasesCardsProps) {
  return (
    <section aria-labelledby="picioare-baze" className="py-8">
      {/* The tab's name as the section's heading, so the cards' h3 follow an h2 (heading order); the tab already shows it. */}
      <h2 id="picioare-baze" className="sr-only">
        Picioare și baze
      </h2>
      <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-[clamp(12px,2vw,24px)] p-0">
        {baseCards(legHeightCm).map((card) => {
          const photoSrc = card.from.map((id) => bases.find((b) => b.id === id)?.photoSrc).find(Boolean);
          return (
            <li key={card.id} className="flex flex-col border border-rule bg-card" data-base={card.id}>
              <Photo
                src={photoSrc}
                alt={card.title}
                ratio="4:3"
                sizes="(min-width: 60rem) 400px, 100vw"
                label="FOTO"
                frame={card.frame}
                className="border-b border-rule"
              />
              <div className="flex flex-1 flex-col gap-2 p-[clamp(14px,1.8vw,22px)]">
                <h3 className="text-[19px] leading-[1.25] font-semibold">{card.title}</h3>
                <p className="text-[15px] text-ink-2">{card.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
