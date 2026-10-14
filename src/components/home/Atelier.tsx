import { Photo } from "@/components/site/Photo";
import { SectionHeader } from "@/components/site/SectionHeader";
import { SpecList } from "@/components/site/SpecList";
import type { Settings } from "@/lib/data/settings.seed";
import { Section } from "./Section";

// DESIGN §4.1, 06 — Atelierul.
export function Atelier({ settings, photoSrc }: { settings: Settings; photoSrc?: string }) {
  return (
    <Section id="atelier" rule>
      <div className="flex flex-wrap gap-[clamp(36px,5vw,64px)]">
        <div className="max-h-[640px] flex-[1_1_420px]">
          <Photo
            src={photoSrc}
            alt="Oamenii din atelier, la lucru"
            ratio="4:5"
            sizes="(min-width: 960px) 45vw, 100vw"
            label="FOTO 08"
            frame="Oamenii din atelier, la lucru: tapițare, capitonare, montajul structurii"
            className="max-h-[640px]"
          />
        </div>
        <div className="flex flex-[1_1_440px] flex-col gap-5">
          <SectionHeader eyebrow="06 — Atelierul" title="Facem un singur lucru: paturi." />
          <p className="text-ink-2">
            Lucrăm din {settings.founded_year} într-un atelier din {settings.city}. Suntem {settings.team_size}{" "}
            oameni, tâmplari și tapițeri, și fiecare pat trece prin mâinile noastre de la desen până la montaj.{" "}
            {settings.story_text}
          </p>
          <SpecList
            items={[
              { k: "Structură", v: settings.structure_text },
              { k: "Somieră", v: settings.slats_text },
              { k: "Burete", v: settings.foam_text },
              { k: "Stofe", v: settings.fabrics_text },
              { k: "Vizite", v: `În atelier, ${settings.visits_note}` },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}
