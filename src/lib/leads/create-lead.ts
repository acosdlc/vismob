import "server-only";
import { environment } from "@/lib/env";
import { verifyFormToken } from "@/lib/security/form-token";
import { clientIp, ipHash } from "@/lib/security/ip";
import { recentLeadCount } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { ParseResult } from "@/lib/validation/schemas";
import {
  CONSENT_TEXT,
  FORM_FIELDS,
  FORM_MESSAGES,
  LEADS_PER_IP_PER_HOUR,
  MIN_FORM_SECONDS,
  type FieldErrors,
  type FormState,
  type LeadInsert,
  type LeadKind,
  type LeadSource,
} from "./types";
import { attachUploads } from "./uploads";

// The shared request pipeline (ARHITECTURA §6.1 step 3), in order: honeypot →
// form token age → Turnstile → Zod → rate limit → insert → move uploads →
// lead_files. Each form supplies its parser and the columns only it fills in.
// Nothing thrown leaves this module: the form always gets a FormState.

/** What every form's parsed data must carry; `uploads` are pending storage paths. */
export interface LeadBaseData {
  name: string;
  phone: string;
  email: string;
  city?: string;
  message?: string;
  wantsMeasurement: boolean;
  uploads?: readonly string[];
}

export interface CreateLeadContext {
  ipHash: string;
  environment: string;
  source: LeadSource;
}

export interface CreateLeadInput<T extends LeadBaseData> {
  kind: LeadKind;
  formData: FormData;
  headers: Headers;
  parse: (formData: FormData) => ParseResult<T>;
  /** The form-specific columns (e.g. `mattress_size`, `config`, `sample_material_ids`). */
  toRow: (data: T, ctx: CreateLeadContext) => Partial<LeadInsert>;
}

export interface CreateLeadDeps {
  admin: () => AdminClient;
  verifyTurnstile: (token: string | null, ip: string) => Promise<boolean>;
  now: () => number;
}

export type CreateLeadResult<T> = { ok: true; leadId: string; data: T } | { ok: false; state: FormState };

export const defaultDeps: CreateLeadDeps = {
  admin: () => createAdminClient(),
  verifyTurnstile,
  now: () => Date.now(),
};

const SOURCE_TEXT_MAX = 500;
const SOURCE_UTM_MAX_ENTRIES = 10;

function stringField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function error(message: string, fieldErrors?: FieldErrors): CreateLeadResult<never> {
  return { ok: false, state: fieldErrors ? { status: "error", message, fieldErrors } : { status: "error", message } };
}

/** The hidden `source` input (page, referrer, utm) sanitised, plus the Vercel environment. */
export function parseSource(raw: string | null, env: string): LeadSource {
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const input = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};

  const text = (value: unknown) =>
    typeof value === "string" && value.length > 0 ? value.slice(0, SOURCE_TEXT_MAX) : undefined;

  const source: LeadSource = { page: text(input.page) ?? "", environment: env };
  const referrer = text(input.referrer);
  if (referrer) source.referrer = referrer;

  if (input.utm && typeof input.utm === "object" && !Array.isArray(input.utm)) {
    const utm: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.utm as Record<string, unknown>).slice(0, SOURCE_UTM_MAX_ENTRIES)) {
      const clean = text(value);
      if (clean) utm[key.slice(0, 100)] = clean;
    }
    if (Object.keys(utm).length > 0) source.utm = utm;
  }
  return source;
}

export async function createLead<T extends LeadBaseData>(
  input: CreateLeadInput<T>,
  deps: CreateLeadDeps = defaultDeps,
): Promise<CreateLeadResult<T>> {
  const { kind, formData, headers } = input;
  try {
    // 3.1 Honeypot and minimum time.
    if (stringField(formData, FORM_FIELDS.honeypot)) return error(FORM_MESSAGES.generic);

    const token = verifyFormToken(stringField(formData, FORM_FIELDS.startedAt), deps.now());
    if (!token.ok || token.ageSeconds < MIN_FORM_SECONDS) return error(FORM_MESSAGES.tooFast);

    // 3.2 Turnstile.
    const ip = clientIp(headers);
    if (!(await deps.verifyTurnstile(stringField(formData, FORM_FIELDS.turnstile), ip))) {
      return error(FORM_MESSAGES.turnstile);
    }

    // 3.3 Validation.
    const parsed = input.parse(formData);
    if (!parsed.ok) return error(FORM_MESSAGES.required, parsed.fieldErrors);
    const data = parsed.data;

    // 3.4 Rate limit.
    const hash = ipHash(ip);
    const admin = deps.admin();
    if ((await recentLeadCount(admin, hash)) >= LEADS_PER_IP_PER_HOUR) return error(FORM_MESSAGES.rateLimited);

    // 3.6 Insert.
    const ctx: CreateLeadContext = {
      ipHash: hash,
      environment: environment(),
      source: parseSource(stringField(formData, FORM_FIELDS.source), environment()),
    };
    const row: LeadInsert = {
      kind,
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city ?? null,
      message: data.message ?? null,
      wants_measurement: data.wantsMeasurement,
      consent_text: CONSENT_TEXT,
      // LeadSource is an interface (no index signature), so it needs the cast into Json.
      source: ctx.source as unknown as Json,
      ip_hash: hash,
      ...input.toRow(data, ctx),
    };
    const { data: inserted, error: insertError } = await admin.from("leads").insert(row).select("id").single();
    if (insertError || !inserted) {
      throw new Error(`leads insert failed: ${insertError?.message ?? "no row returned"}`);
    }
    const leadId = inserted.id;

    // Photos: verified, moved under the lead and recorded. Never fatal.
    if (data.uploads && data.uploads.length > 0) {
      await attachUploads(admin, leadId, data.uploads);
    }

    return { ok: true, leadId, data };
  } catch (err) {
    console.error(`createLead(${kind})`, err);
    return error(FORM_MESSAGES.generic);
  }
}
