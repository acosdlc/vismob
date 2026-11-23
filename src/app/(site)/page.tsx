import type { Metadata } from "next";
import { Atelier } from "@/components/home/Atelier";
import { ConfiguratorBand } from "@/components/home/ConfiguratorBand";
import { ContactForm } from "@/components/contact/ContactForm";
import { ContactSection } from "@/components/home/ContactSection";
import { FaqSection } from "@/components/home/FaqSection";
import { Gallery } from "@/components/home/Gallery";
import { Hero } from "@/components/home/Hero";
import { MaterialsTeaser } from "@/components/home/MaterialsTeaser";
import { Models } from "@/components/home/Models";
import { Process } from "@/components/home/Process";
import { Reviews } from "@/components/home/Reviews";
import { Facts } from "@/components/site/Facts";
import { JsonLd } from "@/components/site/JsonLd";
import { getCatalog } from "@/lib/data/catalog";
import { mediaUrl } from "@/lib/data/media";
import { getStartingPrices } from "@/lib/data/pricing";
import { getHeroProject, getProjects } from "@/lib/data/projects";
import { getReviews } from "@/lib/data/reviews";
import { getSettings } from "@/lib/data/settings";
import { furnitureStoreJsonLd } from "@/lib/seo/json-ld";
import { siteUrl } from "@/lib/site-url";

// The title and the description come from the root layout.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Acasă, in the DESIGN §4.1 order. Every bracket on this page is a seed value.
export default async function Home() {
  const [settings, catalog, hero, featured, reviews] = await Promise.all([
    getSettings(),
    getCatalog(),
    getHeroProject(),
    getProjects({ featured: true }),
    getReviews(),
  ]);
  // The grid stays on the server while prices are not public (ARHITECTURA §7).
  const startingPrices = settings.show_prices ? await getStartingPrices() : {};

  return (
    <>
      {/* ARHITECTURA §10: FurnitureStore, absent while the name is a placeholder. */}
      <JsonLd data={furnitureStoreJsonLd(settings, siteUrl())} />
      <Hero settings={settings} hero={hero} worksHref={featured.length > 0 ? "#lucrari" : "/lucrari"} />
      <div className="container-site">
        <Facts
          items={[
            { label: "Fabricat", value: `În atelierul din ${settings.city}` },
            { label: "Termen", value: settings.lead_time },
            { label: "Garanție", value: `${settings.warranty_structure_years} ani la structură` },
            { label: "Livrare + montaj", value: settings.delivery_zone },
          ]}
        />
      </div>
      <Process settings={settings} />
      <Models catalog={catalog} showPrices={settings.show_prices} startingPrices={startingPrices} />
      <MaterialsTeaser catalog={catalog} settings={settings} />
      <ConfiguratorBand />
      <Gallery projects={featured} />
      {/* FOTO 08 is uploaded from Setări (PR-9); without a path the placeholder stays. */}
      <Atelier settings={settings} photoSrc={mediaUrl(settings.atelier_photo_path)} />
      <Reviews reviews={reviews} settings={settings} />
      <FaqSection settings={settings} />
      <ContactSection settings={settings} form={<ContactForm responseTime={settings.response_time} page="/" />} />
    </>
  );
}
