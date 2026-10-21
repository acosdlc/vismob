import { Faq } from "@/components/site/Faq";
import { CUSTOM_W } from "@/lib/configurator/catalog.seed";
import type { Settings } from "@/lib/data/settings.seed";
import { Section } from "./Section";

// DESIGN §4.1, 08 — Întrebări. The price question shows only when prices are public.
export function FaqSection({ settings, startingPrice }: { settings: Settings; startingPrice?: string }) {
  const items = [
    ...(settings.show_prices && startingPrice
      ? [
          {
            q: "Cât costă un pat la comandă?",
            a: `Depinde de model, dimensiune și material. Un pat de 160 × 200 cm pornește de la ${startingPrice}. Prețul final îl primești în scris, după ce stabilim toate detaliile.`,
          },
        ]
      : []),
    {
      q: "Cât durează?",
      a: `${settings.lead_time} de la confirmarea comenzii și plata avansului de ${settings.deposit_pct}%.`,
    },
    {
      q: "Faceți și dimensiuni nestandard?",
      a: `Da. Construim pe orice dimensiune de saltea, între ${CUSTOM_W.min} și ${CUSTOM_W.max} cm lățime.`,
    },
    {
      q: "Pot vedea materialele înainte?",
      a: `Da, în atelier, ${settings.visits_note}.`,
    },
    { q: "Livrați și în afara orașului?", a: settings.delivery_note },
    {
      q: "Ce garanție are patul?",
      a: `${settings.warranty_structure_years} ani pentru structură și ${settings.warranty_upholstery_years} ani pentru tapițerie.`,
    },
    { q: "Vindeți și saltele?", a: settings.mattresses_note },
  ];
  return (
    <Section id="intrebari" rule>
      <div className="flex flex-wrap gap-[clamp(36px,5vw,64px)]">
        <div className="flex flex-[1_1_300px] flex-col gap-4">
          <span className="eyebrow">08 — Întrebări</span>
          <h2 className="h2-section">Ce ne întreabă toată lumea</h2>
        </div>
        <div className="flex-[2_1_520px]">
          <Faq items={items} />
        </div>
      </div>
    </Section>
  );
}
