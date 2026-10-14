"use client";

import { useSyncExternalStore } from "react";
import { priceFor, type Pricing } from "@/lib/configurator/pricing";
import { configCode, formatPrice, ticketRows, whatsappText, whatsappUrl } from "@/lib/configurator/format";
import type { Resolved } from "@/lib/configurator/rules";
import { shareUrl } from "@/lib/site-url";
import { Button } from "@/components/site/Button";
import { Ticket } from "@/components/site/Ticket";
import type { ConfiguratorSettings } from "./types";

// DESIGN §4.2 item 2, §5.6, §5.7: the „Fișă de configurare” ticket (size md), the code with
// aria-live (§7), the rows, the price block over a dashed rule and the two buttons.

export const PRICE_NOTE_SHOWN = "Calculat din grila atelierului: model × dimensiune + material + opționale. Prețul final se confirmă în scris.";
export const PRICE_NOTE_HIDDEN = "Prețul final îl confirmăm în scris, după o discuție scurtă.";

/** The indicative price as text, or null when prices are hidden or the grid has no row. */
export function priceLabel(resolved: Resolved, settings: Pick<ConfiguratorSettings, "show_prices">, pricing: Pricing | null): string | null {
  if (!settings.show_prices) return null;
  const lei = priceFor(resolved, pricing);
  return lei === null ? null : formatPrice(lei);
}

const subscribeNoop = () => () => undefined;
/** window.location.origin after hydration; "" on the server, so the markup never touches window. */
function useOrigin(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
}

export interface TicketPanelProps {
  resolved: Resolved;
  settings: ConfiguratorSettings;
  pricing: Pricing | null;
  className?: string;
}

export function TicketPanel({ resolved, settings, pricing, className }: TicketPanelProps) {
  const origin = useOrigin();
  const code = configCode(resolved);
  const price = priceLabel(resolved, settings, pricing);
  const wa = whatsappUrl(settings.whatsapp_number, whatsappText(resolved, shareUrl(resolved.cfg, origin)));

  return (
    <Ticket
      size="md"
      title="Fișă de configurare"
      number={
        <span aria-live="polite" data-testid="ticket-code" className="normal-case">
          {code}
        </span>
      }
      rows={ticketRows(resolved)}
      className={className}
    >
      <div className="flex flex-col gap-1 border-t border-dashed border-rule pt-3" data-testid="price-block">
        {price !== null && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[15px] leading-[1.4] font-semibold">Preț orientativ</span>
            <span className="font-mono text-[20px] leading-[1.2] font-medium" data-testid="price">
              {price}
            </span>
          </div>
        )}
        <p className="mono-12 text-muted">{price !== null ? PRICE_NOTE_SHOWN : PRICE_NOTE_HIDDEN}</p>
      </div>
      <div className="flex flex-col gap-[10px]">
        <Button href="#cerere" arrow>
          Cere ofertă pentru acest pat
        </Button>
        {wa && (
          <Button variant="secondary" href={wa}>
            Trimite pe WhatsApp
          </Button>
        )}
      </div>
    </Ticket>
  );
}
