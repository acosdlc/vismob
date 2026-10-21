import type { Metadata } from "next";
import { MaterialsBrowser } from "@/components/materials/MaterialsBrowser";
import { PageHeader } from "@/components/site/PageHeader";
import { getCatalog } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Materiale" };

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
      <PageHeader
        title="Materiale"
        lead={`Tot ce vezi aici se poate alege în configurator. Apasă pe o mostră ca s-o vezi pe patul tău, sau vino să le vezi în atelier, ${settings.visits_note}.`}
      />
      <MaterialsBrowser catalog={catalog} settings={clientSettings} />
    </div>
  );
}
