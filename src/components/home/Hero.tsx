import { Button } from "@/components/site/Button";
import { DimensionLine } from "@/components/site/DimensionLine";
import { Photo } from "@/components/site/Photo";
import { Ticket } from "@/components/site/Ticket";
import type { Project } from "@/lib/data/projects";
import type { Settings } from "@/lib/data/settings.seed";

// DESIGN §4.1 Hero. The ticket and the dimension come from the project flagged
// `hero`; without one, only the photo box shows. A row the workshop left empty
// (no material, no delivery date) is dropped rather than shown blank. „Vezi lucrări”
// goes to #lucrari (DESIGN); when section 05 is hidden it goes to /lucrari instead.
export function Hero({
  settings,
  hero,
  worksHref = "#lucrari",
}: {
  settings: Settings;
  hero: Project | null;
  worksHref?: string;
}) {
  const rows = hero
    ? [
        { k: "Model", v: hero.modelId.charAt(0).toUpperCase() + hero.modelId.slice(1) },
        { k: "Saltea", v: `${hero.widthCm} × ${hero.lengthCm} cm` },
        { k: "Material", v: hero.materialLabel },
        { k: "Bază", v: hero.baseLabel },
        { k: "Livrat", v: hero.deliveredLabel },
      ].filter((row) => row.v !== "")
    : [];

  return (
    <section className="container-site pt-[clamp(40px,6vw,80px)] pb-[clamp(48px,6vw,80px)]">
      <div className="flex flex-wrap items-center gap-[clamp(36px,5vw,64px)]">
        <div className="flex flex-[1.2_1_540px] flex-col gap-[26px]">
          <span className="eyebrow">Atelier de paturi la comandă · {settings.city}</span>
          <h1 className="h1-hero">Paturi construite pe măsura camerei tale.</h1>
          <p className="lead">
            Alegi forma, dimensiunea și materialele. Noi desenăm patul, îl construim în atelierul nostru și îl
            montăm la tine acasă. Fără stoc și fără compromisuri de dimensiune.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/configurator" variant="primary" arrow>
              Configurează-ți patul
            </Button>
            <Button href={worksHref} variant="secondary">
              Vezi lucrări
            </Button>
          </div>
          <p className="mono-13 text-muted">Ofertă gratuită · răspundem în {settings.response_time}</p>
        </div>

        <div className="relative flex-[1_1_440px]">
          {hero && (
            <div className="absolute inset-x-0 top-2">
              <DimensionLine label={`${hero.widthCm} cm`} orientation="horizontal" />
            </div>
          )}
          <div className="pt-[34px]">
            <Photo
              src={hero?.photo?.src}
              alt={hero ? (hero.photo?.alt ?? hero.title) : "Pat finalizat, în dormitorul unui client"}
              ratio="5:4"
              sizes="(min-width: 960px) 45vw, 100vw"
              priority
              label={hero?.photo?.label ?? "FOTO 01"}
              frame={hero?.photo?.frame ?? "Pat finalizat, în dormitorul unui client. Lumină naturală, cadru orizontal, fără blitz."}
            />
          </div>
          {hero && (
            <div className="absolute bottom-4 left-4 w-[min(310px,calc(100%-32px))]">
              <Ticket
                title="FIȘĂ PROIECT"
                number={hero.ticketNo ? `Nr. ${hero.ticketNo}` : undefined}
                rows={rows}
                size="sm"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
