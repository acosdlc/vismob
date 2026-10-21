import type { Metadata } from "next";
import { Archivo, DM_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getSettings } from "@/lib/data/settings";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

// DESIGN §2.2: Archivo variable with the width axis, DM Mono 400/500, both with
// latin-ext for ș and ț.
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { workshop_name } = await getSettings();
  return {
    // The origin the social image resolves against: the same one robots.ts and sitemap.ts use.
    metadataBase: new URL(siteUrl()),
    title: { default: `${workshop_name} · Paturi la comandă`, template: `%s · ${workshop_name}` },
    description: "Paturi construite pe măsura camerei tale, în atelier.",
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={`${archivo.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        {/* ARHITECTURA §10: Vercel Web Analytics and Speed Insights, cookie-free (§9). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
