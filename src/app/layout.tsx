import type { Metadata } from "next";
import { Archivo, DM_Mono } from "next/font/google";
import { getSettings } from "@/lib/data/settings";
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
    title: { default: `${workshop_name} · Paturi la comandă`, template: `%s · ${workshop_name}` },
    description: "Paturi construite pe măsura camerei tale, în atelier.",
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={`${archivo.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
