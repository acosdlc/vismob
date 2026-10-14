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
import { getCatalog } from "@/lib/data/catalog";
import { getHeroProject, getProjects } from "@/lib/data/projects";
import { getReviews } from "@/lib/data/reviews";
import { getSettings } from "@/lib/data/settings";

// Acasă, in the DESIGN §4.1 order. Every bracket on this page is a seed value.
export default async function Home() {
  const [settings, catalog, hero, featured, reviews] = await Promise.all([
    getSettings(),
    getCatalog(),
    getHeroProject(),
    getProjects({ featured: true }),
    getReviews(),
  ]);

  return (
    <>
      <Hero settings={settings} hero={hero} />
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
      <Models catalog={catalog} showPrices={settings.show_prices} />
      <MaterialsTeaser catalog={catalog} settings={settings} />
      <ConfiguratorBand />
      <Gallery projects={featured} />
      <Atelier settings={settings} />
      <Reviews reviews={reviews} settings={settings} />
      <FaqSection settings={settings} />
      <ContactSection settings={settings} form={<ContactForm responseTime={settings.response_time} page="/" />} />
    </>
  );
}
