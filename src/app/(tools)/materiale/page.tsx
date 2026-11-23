import type { Metadata } from "next";
import { MaterialsBrowser } from "@/components/materials/MaterialsBrowser";
import { PageHeader } from "@/components/site/PageHeader";
import { getCatalog } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";

/** DESIGN §4.3, the paragraph under the H1, with `visits_note` where DESIGN writes „[cu programare]”. */
function lead(visitsNote: string): string {
  return `Tot ce vezi aici se poate alege în configurator. Apasă pe o mostră ca s-o vezi pe patul tău, sau vino să le vezi în atelier, ${visitsNote}.`;
}

// The lead is also the description (ARHITECTURA §10); getSettings() is cached, so the
// metadata stays part of the prerender.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return { title: "Materiale", description: lead(settings.visits_note), alternates: { canonical: "/materiale" } };
}

// DESIGN §4.3. A static page: the catalogue and the settings come in as props; every
// swatch opens the configurator with that colour preselected.
export default async function MaterialePage() {
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const clientSettings = {
    leg_height_cm: settings.leg_height_cm,
    oil_refresh_interval: settings.oil_refresh_interval,
  };

  return (
    <div className="container-site">
      <PageHeader title="Materiale" lead={lead(settings.visits_note)} />
      <MaterialsBrowser catalog={catalog} settings={clientSettings} />
    </div>
  );
}
