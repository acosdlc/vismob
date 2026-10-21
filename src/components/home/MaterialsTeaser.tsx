import { Button } from "@/components/site/Button";
import { SectionHeader } from "@/components/site/SectionHeader";
import { Swatch } from "@/components/site/Swatch";
import type { Catalog } from "@/lib/configurator/types";
import type { Settings } from "@/lib/data/settings.seed";
import { Section } from "./Section";

// DESIGN §4.1, 03 — Materiale: the eight `featured` colours.
export function MaterialsTeaser({ catalog, settings }: { catalog: Catalog; settings: Settings }) {
  const featured = catalog.families.flatMap((f) =>
    f.colors.filter((c) => c.featured).map((c) => ({ ...c, family: f })),
  );
  return (
    <Section id="materiale" rule>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <SectionHeader
          eyebrow="03 — Materiale"
          title="Atingi materialele înainte să alegi."
          aside={`Catifea, bouclé, stofă, piele ecologică sau lemn masiv. Le vezi în atelier, ${settings.visits_note}.`}
        />
        <div className="flex flex-wrap gap-3">
          <Button href="/materiale" variant="primary">
            Toate materialele
          </Button>
        </div>
      </div>
      <ul className="mt-[clamp(32px,4vw,56px)] grid list-none grid-cols-[repeat(auto-fit,minmax(min(100px,100%),1fr))] gap-3 p-0">
        {featured.map((c) => (
          <li key={c.id}>
            <Swatch
              name={c.name}
              hex={c.hex}
              family={c.family.id}
              familyName={c.family.name}
              code={c.code}
              photoSrc={c.photoSrc}
              sub="family"
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
