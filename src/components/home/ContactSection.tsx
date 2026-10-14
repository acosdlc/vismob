import type { ReactNode } from "react";
import { Button } from "@/components/site/Button";
import { telHref } from "@/components/site/links";
import { SpecList } from "@/components/site/SpecList";
import type { Settings } from "@/lib/data/settings.seed";
import { Section } from "./Section";

// DESIGN §4.1, 09 — Contact. The request form (right column) is passed in by the
// page: PR-2 adds it with its Server Action; until then the column stays empty
// rather than showing a form that does not submit.
export function ContactSection({
  settings,
  form,
  headingLevel = 2,
}: {
  settings: Settings;
  form?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const digits = settings.whatsapp_number.replace(/\D/g, "");
  const wa = digits.length >= 8 ? `https://wa.me/${digits}` : null;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`;
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <Section id="contact" rule>
      <div className="flex flex-wrap gap-[clamp(36px,5vw,64px)]">
        <div className="flex flex-[1_1_380px] flex-col gap-[22px]">
          <span className="eyebrow">09 — Contact</span>
          <Heading className="h2-request">Spune-ne ce pat îți dorești.</Heading>
          <p className="text-ink-2">O poză cu camera și dimensiunea saltelei sunt suficiente ca să începem.</p>
          <SpecList
            items={[
              { k: "Telefon", v: <a href={telHref(settings.phone_public)}>{settings.phone_public}</a> },
              { k: "Email", v: <a href={`mailto:${settings.email_public}`}>{settings.email_public}</a> },
              { k: "Atelier", v: `${settings.address} · vizite ${settings.visits_note}` },
              { k: "Program", v: settings.hours },
            ]}
          />
          <div className="flex flex-wrap gap-3">
            {wa && (
              <Button href={wa} variant="primary" className="flex-[1_1_200px]" target="_blank" rel="noreferrer">
                Scrie-ne pe WhatsApp
              </Button>
            )}
            <Button href={telHref(settings.phone_public)} variant="secondary" className="flex-[1_1_200px]">
              Sună acum
            </Button>
          </div>
          {/* The map loads only on request (no Google cookies before a click): PR-2 adds
              the click-to-load embed; until then the button opens Google Maps. */}
          <div className="photo-placeholder flex h-[220px] items-center justify-center border border-rule">
            <Button href={maps} variant="secondary" target="_blank" rel="noreferrer">
              Arată harta
            </Button>
          </div>
        </div>
        {form && <div className="flex-[1_1_440px]">{form}</div>}
      </div>
    </Section>
  );
}
