import type { Config } from "@/lib/configurator/types";
import type { Catalog } from "@/lib/configurator/types";
import type { Pricing } from "@/lib/configurator/pricing";
import type { Settings } from "@/lib/data/settings.seed";

// Shared contracts of the configurator page (docs/DESIGN.md §4.2, §5; docs/PLAN.md PR-3).
// The page (src/app/(tools)/configurator/page.tsx) is a static shell: the configuration
// lives in the URL (§5.3) and is read in the browser, so the server never awaits
// searchParams. The pieces below are built by separate builders; these props are the
// agreement between them.

/** What the client root needs from `settings`; nothing else reaches the browser. */
export type ConfiguratorSettings = Pick<Settings, "show_prices" | "whatsapp_number" | "response_time">;

export interface ConfiguratorProps {
  catalog: Catalog;
  settings: ConfiguratorSettings;
  /** The price grid, only when `settings.show_prices` (ARHITECTURA §7); null otherwise. */
  pricing: Pricing | null;
}

/** Section 07 „Trimite configurația” (DESIGN §4.2): the text column and the quote form. */
export interface QuoteSectionProps {
  /** The current, resolved configuration (`resolve().cfg`); re-sent on every submit. */
  config: Config;
  /** `configCode(resolved)`, shown in the „Configurația atașată” box and in the confirmation. */
  code: string;
  /** `settings.response_time`, e.g. „24 de ore”. */
  responseTime: string;
}

/** The hidden input of the quote form; its value is `paramsFromConfig(config).toString()`. */
export const QUOTE_FIELDS = {
  config: "config",
} as const;

/* Server Action (src/actions/submit-quote.ts), for reference:
   submitQuote(prev: FormState, formData: FormData): Promise<FormState>
   → on success { status: "ok", leadId, code } where `code` is the configuration code
     recomputed on the server from the posted `config` (resolve → configCode). */
