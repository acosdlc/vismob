import type { Metadata } from "next";
import { MaterialsBrowser } from "@/components/materials/MaterialsBrowser";
import { PageHeader } from "@/components/site/PageHeader";
import { getCatalog } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Materiale" };

// DESIGN §4.3. A static page: the catalogue and the settings come in as props; the
// sample box lives in the browser and is read after mount.
export default async function MaterialePage() {
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const clientSettings = {
    sample_limit: settings.sample_limit,
    samples_free: settings.samples_free,
    samples_delivery: settings.samples_delivery,
    leg_height_cm: settings.leg_height_cm,
    oil_refresh_interval: settings.oil_refresh_interval,
  };

  return (
    <div className="container-site">
      <PageHeader
        title="Materiale"
        lead={`Tot ce vezi aici se poate alege în configurator. Apasă pe o mostră ca s-o adaugi în cutia ta: îți trimitem acasă până la ${settings.sample_limit} bucăți, ${settings.samples_free}, sau le vezi în atelier, cu programare.`}
      />
      <MaterialsBrowser catalog={catalog} settings={clientSettings} />
    </div>
  );
}
