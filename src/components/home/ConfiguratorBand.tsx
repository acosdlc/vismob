import { BedLineArt } from "@/components/drawings/BedLineArt";
import { Button } from "@/components/site/Button";
import { DimensionLine } from "@/components/site/DimensionLine";

// DESIGN §4.1, 04 — Configurator: the accent band with the line-art bed and two
// dimension lines (§3.11). Positions are percentages of the 200×150 drawing.
export function ConfiguratorBand() {
  return (
    <section className="on-dark bg-accent py-[clamp(56px,7vw,96px)] text-white">
      <div className="container-site flex flex-wrap items-center gap-[clamp(36px,5vw,64px)]">
        <div className="flex flex-[1_1_420px] flex-col gap-5">
          <span className="eyebrow text-white/75">04 — Configurator</span>
          <h2 className="h2-section">Construiește-ți patul pe ecran, în două minute.</h2>
          <p className="text-white/86">
            Alegi modelul, dimensiunea, materialul și baza. Vezi desenul la scară și trimiți configurația direct
            atelierului. Oferta finală o primești după o discuție scurtă.
          </p>
          <div>
            <Button href="/configurator" variant="inverse" arrow>
              Deschide configuratorul
            </Button>
          </div>
        </div>
        <div className="relative aspect-[4/3] w-full max-w-[600px] flex-[1_1_420px]">
          <BedLineArt model="capitonat" tone="dark" className="h-full w-full" idPrefix="band" />
          <div className="absolute bottom-[4%] left-[13%] w-[74%]">
            <DimensionLine label="160 cm" orientation="horizontal" background="var(--color-accent)" />
          </div>
          <div className="absolute bottom-[13.3%] left-[89%] h-[66.7%]">
            <DimensionLine label="120 cm" orientation="vertical" background="var(--color-accent)" className="h-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
