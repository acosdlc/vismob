import { ProcessCard } from "@/components/site/ProcessCard";
import { SectionHeader } from "@/components/site/SectionHeader";
import type { Settings } from "@/lib/data/settings.seed";
import { Section } from "./Section";

// DESIGN §4.1, 01 — Cum lucrăm.
export function Process({ settings }: { settings: Settings }) {
  const steps = [
    {
      number: "01",
      title: "Discutăm și măsurăm",
      text: "Ne spui ce îți dorești — la telefon, pe WhatsApp sau în atelier. Dacă e nevoie, venim să măsurăm camera.",
      meta: `Măsurători: ${settings.measurement_note}`,
    },
    {
      number: "02",
      title: "Desenăm și facem oferta",
      text: "Primești schița patului cu dimensiunile exacte, materialele alese și prețul final. Nu începem nimic până nu confirmi.",
      meta: `Ofertă în ${settings.offer_days} zile lucrătoare`,
    },
    {
      number: "03",
      title: "Construim în atelier",
      text: "Structura, tapițeria și finisajele se fac la noi, de la prima tăietură până la ultimul nasture.",
      meta: `Execuție: ${settings.lead_time}`,
    },
    {
      number: "04",
      title: "Livrăm și montăm",
      text: "Aducem patul, îl montăm și plecăm cu ambalajele. Tu doar pui așternuturile.",
      meta: `Montaj: ${settings.installation_note}`,
    },
  ];
  return (
    <Section id="proces">
      <SectionHeader eyebrow="01 — Cum lucrăm" title="De la o schiță pe hârtie la patul din dormitorul tău." />
      <ol className="mt-[clamp(32px,4vw,56px)] grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4 p-0">
        {steps.map((s) => (
          <ProcessCard key={s.number} {...s} />
        ))}
      </ol>
    </Section>
  );
}
