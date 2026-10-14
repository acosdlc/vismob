import type { ReactNode } from "react";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { getSettings } from "@/lib/data/settings";

// /configurator and /materiale (DESIGN §3.1, §3.17): the header without „Cere ofertă”
// (the page has its own CTA) and the compact footer.
export default async function ToolsLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      <Header settings={settings} variant="tool" />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} variant="compact" />
    </>
  );
}
