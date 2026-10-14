import type { Metadata } from "next";
import { Suspense } from "react";
import { Configurator } from "@/components/configurator/Configurator";
import { ConfiguratorSkeleton } from "@/components/configurator/ConfiguratorSkeleton";
import { PageHeader } from "@/components/site/PageHeader";
import { getCatalog } from "@/lib/data/catalog";
import { getPricing } from "@/lib/data/pricing";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Configurator" };

// DESIGN §4.2. A static shell: the configuration lives in the URL (§5.3) and is read in
// the browser by the client root (useSearchParams inside <Suspense>), so this page never
// awaits searchParams and stays prerendered.
export default async function ConfiguratorPage() {
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  // The price grid reaches the browser only when prices are shown (ARHITECTURA §7).
  const pricing = settings.show_prices ? await getPricing() : null;
  const clientSettings = {
    show_prices: settings.show_prices,
    whatsapp_number: settings.whatsapp_number,
    response_time: settings.response_time,
  };

  return (
    <>
      <div className="container-site">
        <PageHeader
          title="Configurează-ți patul"
          lead="Desenul se schimbă la fiecare alegere și e la scară. Trimiți configurația, iar prețul final îl confirmăm după o discuție scurtă, fără obligații."
          aside="6 pași · aproximativ 2 minute"
        />
      </div>
      <Suspense fallback={<ConfiguratorSkeleton />}>
        <Configurator catalog={catalog} settings={clientSettings} pricing={pricing} />
      </Suspense>
    </>
  );
}
