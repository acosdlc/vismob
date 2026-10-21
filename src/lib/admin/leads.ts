import type { LeadStatus } from "@/lib/admin/types";
import { LEAD_STATUSES } from "@/lib/admin/types";
import type { Config } from "@/lib/configurator/types";
import { configFromParams } from "@/lib/configurator/url";
import type { FieldErrors, LeadKind, LeadRow } from "@/lib/leads/types";
import type { Json } from "@/lib/supabase/database.types";

// Pure helpers of the Cereri screens (docs/PLAN.md PR-7, ARHITECTURA §8): the
// filters read from the URL, the PostgREST chain they become, the stored
// configuration back into a Config, the ticket rows and the date format. No
// Supabase, no React: the pages and the actions call these and only display.

/** The kinds the „Tip” filter offers; `mostre` stays in the enum but is no longer requested. */
export const LEAD_FILTER_KINDS = ["contact", "configurator"] as const satisfies readonly LeadKind[];
export type LeadFilterKind = (typeof LEAD_FILTER_KINDS)[number];

export const LEAD_PERIODS = ["7", "30", "90", "all"] as const;
export type LeadPeriod = (typeof LEAD_PERIODS)[number];

/** Labels of the „Perioadă” select, in its order. */
export const LEAD_PERIOD_LABELS: Record<LeadPeriod, string> = {
  "7": "7 zile",
  "30": "30 de zile",
  "90": "90 de zile",
  all: "toate",
};

export interface LeadFilters {
  kind?: LeadFilterKind;
  status?: LeadStatus;
  period: LeadPeriod;
  /** The search text, trimmed, at most SEARCH_MAX characters. */
  q: string;
}

/** The URL keys of the list's GET form. */
export const LEAD_FILTER_KEYS = { kind: "tip", status: "status", period: "perioada", q: "q" } as const;

export const SEARCH_MAX = 80;

/** How many rows the list reads at most; the screen says so when the limit is hit. */
export const LEADS_PAGE_SIZE = 200;

export const DEFAULT_LEAD_FILTERS: LeadFilters = { period: "all", q: "" };

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === "string" && (list as readonly string[]).includes(value);

const isFilterKind = oneOf(LEAD_FILTER_KINDS);
const isStatus = oneOf(LEAD_STATUSES);
const isPeriod = oneOf(LEAD_PERIODS);

/** The first value of a search param (a repeated key arrives as an array). */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The filters in the URL, with unknown values dropped and the search trimmed and bounded. */
export function parseLeadFilters(searchParams: Record<string, string | string[] | undefined>): LeadFilters {
  const kind = first(searchParams[LEAD_FILTER_KEYS.kind]);
  const status = first(searchParams[LEAD_FILTER_KEYS.status]);
  const period = first(searchParams[LEAD_FILTER_KEYS.period]);
  const q = first(searchParams[LEAD_FILTER_KEYS.q]);

  const filters: LeadFilters = {
    period: isPeriod(period) ? period : DEFAULT_LEAD_FILTERS.period,
    q: typeof q === "string" ? q.trim().slice(0, SEARCH_MAX) : "",
  };
  if (isFilterKind(kind)) filters.kind = kind;
  if (isStatus(status)) filters.status = status;
  return filters;
}

/** Whether any filter differs from the default (the „Șterge filtrele” link shows then). */
export function hasLeadFilters(filters: LeadFilters): boolean {
  return (
    filters.kind !== undefined ||
    filters.status !== undefined ||
    filters.period !== DEFAULT_LEAD_FILTERS.period ||
    filters.q !== ""
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ISO timestamp `created_at` must reach for a period, or null for „toate”. */
export function periodStart(period: LeadPeriod, now: Date): string | null {
  if (period === "all") return null;
  return new Date(now.getTime() - Number(period) * DAY_MS).toISOString();
}

/**
 * PostgREST's `.or()` splits its argument on commas and reads parentheses, so
 * the search text loses them, plus `%` (the wildcard) and backslashes.
 */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%\\]/g, "").trim();
}

/** The columns the search looks in, with `ilike`. */
export const SEARCH_COLUMNS = ["name", "email", "phone", "config_code"] as const;

/**
 * The stored phone is E.164 (`+40722123456`, the transform in validation/schemas.ts),
 * while the workshop types it as written in Romania (`0722 123 456`): for a search of
 * digits with the trunk `0`, the digits after it, so the number is found either way.
 * Null for any other search.
 */
export function phoneSearchDigits(search: string): string | null {
  const digits = search.replace(/\s/g, "");
  return /^0\d{3,}$/.test(digits) ? digits.slice(1) : null;
}

/** The three filter methods the chain uses; PostgREST's builder has them, and so can a test's fake. */
export interface LeadQuery {
  eq(column: string, value: string): this;
  gte(column: string, value: string): this;
  or(filters: string): this;
}

/** Chains the filters onto a `from("leads").select(...)` builder (before `order` and `limit`). */
export function applyLeadFilters<Q extends LeadQuery>(query: Q, filters: LeadFilters, now: Date): Q {
  let q = query;
  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.status) q = q.eq("status", filters.status);
  const start = periodStart(filters.period, now);
  if (start) q = q.gte("created_at", start);
  const search = sanitizeSearch(filters.q);
  if (search) {
    const terms = SEARCH_COLUMNS.map((column) => `${column}.ilike.%${search}%`);
    const digits = phoneSearchDigits(search);
    if (digits) terms.push(`phone.ilike.%${digits}%`);
    q = q.or(terms.join(","));
  }
  return q;
}

/** `leads.config` keys → the query-string keys configFromParams reads (DESIGN §5.3). */
const CONFIG_PARAM: Record<keyof Config, string> = {
  model: "m",
  size: "s",
  customW: "w",
  customL: "l",
  family: "f",
  color: "c",
  hb: "h",
  base: "b",
  led: "led",
  nightstands: "n",
};

/**
 * The stored configuration (submit-quote.ts writes the resolved cfg with customW
 * and customL) back into a Config, through the same reader the URL uses; resolve()
 * then repairs anything the catalogue no longer has. Null when `config` is not an object.
 */
export function leadConfig(lead: Pick<LeadRow, "config">): Config | null {
  const stored = lead.config;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const sp = new URLSearchParams();
  for (const [key, param] of Object.entries(CONFIG_PARAM) as [keyof Config, string][]) {
    const value = stored[key];
    if (typeof value === "string" || typeof value === "number") sp.set(param, String(value));
    else if (value === true) sp.set(param, "1");
  }
  return configFromParams(sp);
}

export type LeadTicketLead = Pick<
  LeadRow,
  "name" | "phone" | "email" | "city" | "address" | "mattress_size" | "wants_measurement" | "message"
>;

/** The contact rows of the lead's ticket (as src/emails/shared.tsx, but plain strings for the site's Ticket). */
export function leadTicketRows(lead: LeadTicketLead): { k: string; v: string }[] {
  const rows = [
    { k: "Nume", v: lead.name },
    { k: "Telefon", v: lead.phone },
    { k: "Email", v: lead.email },
  ];
  if (lead.city) rows.push({ k: "Localitate", v: lead.city });
  if (lead.address) rows.push({ k: "Adresă", v: lead.address });
  if (lead.mattress_size) rows.push({ k: "Saltea", v: lead.mattress_size });
  rows.push({ k: "Măsurători", v: lead.wants_measurement ? "da" : "nu" });
  if (lead.message) rows.push({ k: "Mesaj", v: lead.message });
  return rows;
}

const LEAD_DATE = new Intl.DateTimeFormat("ro-RO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Bucharest",
});

/** „14 oct. 2026, 10:32” in Romania's time zone; "" for an unreadable timestamp. */
export function formatLeadDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return LEAD_DATE.format(date);
}

const PLURAL = new Intl.PluralRules("ro");

/** „1 cerere”, „5 cereri”, „200 de cereri”. */
export function leadCountLabel(count: number): string {
  const category = PLURAL.select(count);
  if (category === "one") return `${count} cerere`;
  return category === "other" ? `${count} de cereri` : `${count} cereri`;
}

/** Digits of a phone number for `https://wa.me/`; null under 8 digits, so the button is hidden. */
export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export interface LeadSourceText {
  /** The page, the UTM pairs and the referrer, in one short line; null when the source holds none. */
  source: string | null;
  /** `source.environment` (production, preview, development). */
  environment: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** `leads.source` (Json, written by create-lead.ts) as two short texts for the MetaList; read defensively. */
export function leadSourceText(source: Json | null): LeadSourceText {
  if (!source || typeof source !== "object" || Array.isArray(source)) return { source: null, environment: null };
  const parts: string[] = [];
  const page = text(source.page);
  if (page) parts.push(page);
  const utm = source.utm;
  if (utm && typeof utm === "object" && !Array.isArray(utm)) {
    for (const [key, value] of Object.entries(utm)) {
      const clean = text(value);
      if (clean) parts.push(`${key}=${clean}`);
    }
  }
  const referrer = text(source.referrer);
  if (referrer) parts.push(`de pe ${referrer}`);
  return { source: parts.length > 0 ? parts.join(" · ") : null, environment: text(source.environment) };
}

/** The first message per field from Zod issues (the admin actions' `fieldErrors`). */
export function zodFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[], fallback: string): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || fieldErrors[field]) continue;
    fieldErrors[field] = issue.message || fallback;
  }
  return fieldErrors;
}
