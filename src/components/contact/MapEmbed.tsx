"use client";

import { useState } from "react";
import { Button } from "@/components/site/Button";

export interface MapEmbedProps {
  /** `settings.address`; the query of both Google Maps URLs. */
  address: string;
  /** Height in px: 220 on Acasă 09, 400 on /contact (docs/PLAN.md). */
  height: number;
}

/** The Google Maps URLs for an address: the embed and the full page. */
export function mapUrls(address: string): { embed: string; open: string } {
  const query = encodeURIComponent(address);
  return {
    embed: `https://www.google.com/maps?q=${query}&output=embed`,
    open: `https://www.google.com/maps/search/?api=1&query=${query}`,
  };
}

// DESIGN §4.1 09 and ARHITECTURA §9: the Google Maps embed loads only after a click
// („Arată harta”), so no Google cookie is set without the visitor asking for it.
// CLAUDE.md rule 3 lists this click-to-load map among the allowed Client Components.
export function MapEmbed({ address, height }: MapEmbedProps) {
  const [shown, setShown] = useState(false);
  const urls = mapUrls(address);

  if (!shown) {
    return (
      <div
        className="photo-placeholder flex items-center justify-center border border-rule"
        style={{ height }}
        data-testid="map-placeholder"
      >
        <Button variant="secondary" onClick={() => setShown(true)}>
          Arată harta
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <iframe
        title="Hartă"
        src={urls.embed}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block w-full border border-rule"
        style={{ height }}
      />
      <a
        href={urls.open}
        target="_blank"
        rel="noreferrer"
        className="mono-12 inline-flex min-h-11 items-center self-start text-ink-2 underline"
      >
        Deschide în Google Maps
      </a>
    </div>
  );
}
