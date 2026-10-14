import type { Database } from "@/lib/supabase/database.types";

// Shared contract between the forms (client), the Server Actions and the
// pipeline (server). Field names are what the forms post and what the actions
// read; keep them in one place.

export type LeadKind = Database["public"]["Enums"]["lead_kind"];
export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export type FieldErrors = Partial<Record<string, string>>;

/** The state `useActionState` holds for every request form. */
export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "ok"; leadId: string; code?: string };

export const INITIAL_FORM_STATE: FormState = { status: "idle" };

/** The exact consent text shown next to the checkbox (DESIGN §4.1 field 7); stored in leads.consent_text. */
export const CONSENT_TEXT = "Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.";

/** The contact form's mattress-size select (DESIGN §4.1 field 3). */
export const MATTRESS_SIZES = [
  "Încă nu știu",
  "90 × 200 cm",
  "120 × 200 cm",
  "140 × 200 cm",
  "160 × 200 cm",
  "180 × 200 cm",
  "200 × 200 cm",
  "Altă dimensiune",
] as const;
export type MattressSize = (typeof MATTRESS_SIZES)[number];

/** Photo uploads (ARHITECTURA §6.1 step 2). */
export const UPLOAD_LIMITS = {
  maxFiles: 6,
  maxBytes: 10 * 1024 * 1024,
  maxUrlsPerIpPerHour: 20,
  accept: "image/jpeg,image/png,image/webp",
  bucket: "lead-uploads",
  pendingPrefix: "pending/",
  /** Longest side after client-side compression. */
  maxSidePx: 2000,
  jpegQuality: 0.8,
} as const;

/** Anti-spam and bookkeeping fields every form posts (hidden inputs). */
export const FORM_FIELDS = {
  /** Not `company`: Chrome's profile autofill fills a field by that name with the organisation. */
  honeypot: "website",
  startedAt: "startedAt",
  turnstile: "turnstileToken",
  source: "source",
  uploads: "uploads",
} as const;

/** Minimum seconds between the form token being issued and the submit. */
export const MIN_FORM_SECONDS = 3;

/** Leads per ip_hash per hour (ARHITECTURA §6.1 step 3.4). */
export const LEADS_PER_IP_PER_HOUR = 5;

export interface LeadSource {
  page: string;
  environment: string;
  referrer?: string;
  utm?: Record<string, string>;
}

export type UploadUrlsResult =
  | { ok: true; uploads: { path: string; token: string }[] }
  | { ok: false; message: string };

/* Server Actions (src/actions/*), for reference:
   submitContact(prev: FormState, formData: FormData): Promise<FormState>
   issueFormToken(): Promise<string>                       // HMAC-signed startedAt
   createUploadUrls(count: number): Promise<UploadUrlsResult>
*/

// Form texts DESIGN leaves to the implementation (listed in the PR for approval).
export const FORM_MESSAGES = {
  required: "Completează acest câmp.",
  name: "Scrie numele tău (2–120 de caractere).",
  phone: "Scrie un număr de telefon valid.",
  email: "Scrie o adresă de email validă.",
  privacy: "Bifează acordul pentru prelucrarea datelor.",
  tooLong: "Textul e prea lung.",
  uploads: "Poți adăuga cel mult 6 poze, fiecare de maximum 10 MB.",
  /** The samples form (DESIGN §4.3); `{n}` is `settings.sample_limit`. */
  samples: "Alege cel puțin o mostră.",
  samplesLimit: "Poți alege cel mult {n} mostre.",
  generic: "Nu am putut trimite cererea. Încearcă din nou sau sună-ne.",
  tooFast: "Formularul a fost trimis prea repede. Încearcă din nou.",
  rateLimited: "Ai trimis deja mai multe cereri. Te rugăm să ne suni.",
  turnstile: "Verificarea anti-spam nu a reușit. Încearcă din nou.",
} as const;
