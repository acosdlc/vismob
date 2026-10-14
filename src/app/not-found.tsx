import type { Metadata } from "next";
import { Button } from "@/components/site/Button";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Pagina nu există" };

// DESIGN §4.7. Rendered outside the (site) group, so it carries its own shell.
export default async function NotFound() {
  const settings = await getSettings();
  return (
    <>
      <Header settings={settings} />
      <main className="container-site section flex flex-1 flex-col gap-6">
        <h1 className="h1-page">Pagina nu există.</h1>
        <p className="lead">Linkul e greșit sau pagina a fost mutată.</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/" variant="primary">Acasă</Button>
          <Button href="/configurator" variant="secondary">Configurator</Button>
        </div>
      </main>
      <Footer settings={settings} />
    </>
  );
}
