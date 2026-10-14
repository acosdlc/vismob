import type { Metadata } from "next";
import { ContactForm } from "@/components/contact/ContactForm";
import { ContactSection } from "@/components/home/ContactSection";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Contact" };

// DESIGN §4.5: section 09 of Acasă as its own page, with an H1 and the large map
// (400px, docs/PLAN.md).
export default async function ContactPage() {
  const settings = await getSettings();
  return (
    <ContactSection
      settings={settings}
      headingLevel={1}
      mapHeight={400}
      form={<ContactForm responseTime={settings.response_time} page="/contact" confirmHeadingLevel={2} />}
    />
  );
}
