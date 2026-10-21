import type { Settings } from "@/lib/data/settings.seed";

// The Setări form (docs/PLAN.md PR-7, ARHITECTURA §8): one descriptor per key of
// `Settings`, grouped as src/lib/data/settings.seed.ts groups them. The labels are
// the workshop's words; a hint says where the value appears on the site and comes
// from the JSDoc of the seed, nothing else. Pure: the client form and the server
// schema (settings-schema.ts) both read it, so it must not import the seed values.

export type SettingsKey = keyof Settings;

/** How the form shows a key and how settings-schema.ts validates it. */
export type SettingsFieldKind = "text" | "textarea" | "url" | "boolean" | "digits";

export interface SettingsField {
  key: SettingsKey;
  /** Short, with comma-below diacritics; the `<label>` text (for a boolean, the checkbox text). */
  label: string;
  /** One sentence: where the value appears on the site, or what shape it has. */
  hint?: string;
  kind: SettingsFieldKind;
  /** Longest accepted value, in characters (the checkbox posts "on"). */
  maxLength: number;
}

export interface SettingsGroup {
  title: string;
  fields: readonly SettingsField[];
}

/** Bounds per kind; the schema enforces them, the inputs carry them as `maxLength`. */
export const SETTINGS_MAX = {
  text: 200,
  textarea: 2000,
  url: 500,
  /** The international number without "+" has 8 to 15 digits (ITU E.164). */
  digits: 15,
  boolean: 2,
} as const satisfies Record<SettingsFieldKind, number>;

const text = (key: SettingsKey, label: string, hint?: string): SettingsField => ({
  key,
  label,
  hint,
  kind: "text",
  maxLength: SETTINGS_MAX.text,
});

const textarea = (key: SettingsKey, label: string, hint?: string): SettingsField => ({
  key,
  label,
  hint,
  kind: "textarea",
  maxLength: SETTINGS_MAX.textarea,
});

const url = (key: SettingsKey, label: string): SettingsField => ({
  key,
  label,
  hint: "Linkul complet, cu https://. Gol: nu apare pe site.",
  kind: "url",
  maxLength: SETTINGS_MAX.url,
});

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: "Firmă și contact",
    fields: [
      text("workshop_name", "Numele atelierului"),
      text("legal_name", "Denumirea firmei"),
      text("cui", "CUI"),
      text("reg_com", "Nr. Registrul Comerțului"),
      textarea("registered_office", "Sediul social"),
      textarea("address", "Adresa atelierului"),
      text("city", "Localitatea"),
      text("phone_public", "Telefon"),
      {
        key: "whatsapp_number",
        label: "WhatsApp",
        hint: "Numărul internațional, doar cifre, fără „+”, de exemplu 40722123456. Gol: ascunde toate butoanele de WhatsApp.",
        kind: "digits",
        maxLength: SETTINGS_MAX.digits,
      },
      text("email_public", "Email"),
      textarea("hours", "Program"),
      text("visits_note", "Vizite", "Completează „În atelier, …” și „vizite …”, de exemplu „cu programare”."),
      url("instagram_url", "Instagram"),
      url("facebook_url", "Facebook"),
      url("google_profile_url", "Profil Google"),
      text("google_rating", "Nota Google", "Apare doar când sunt completate și nota, și numărul de recenzii."),
      text(
        "google_reviews_count",
        "Număr de recenzii Google",
        "Apare doar când sunt completate și nota, și numărul de recenzii.",
      ),
    ],
  },
  {
    title: "Promisiuni și termeni",
    fields: [
      text("response_time", "Timp de răspuns", "De exemplu „24 de ore”: completează „răspundem în …” și „Te sunăm în …”."),
      text("lead_time", "Termen de execuție", "De exemplu „4–6 săptămâni”."),
      text("warranty_structure_years", "Garanție structură (ani)"),
      text("warranty_upholstery_years", "Garanție tapițerie (ani)"),
      text("delivery_zone", "Zona de livrare"),
      textarea(
        "delivery_note",
        "Livrare și montaj",
        "Răspunsul din Întrebări frecvente: unde livrați și montați și cât costă transportul.",
      ),
      text("measurement_note", "Măsurători", "Completează „Măsurători: …”."),
      text("offer_days", "Zile până la ofertă", "Completează „Ofertă în … zile lucrătoare”."),
      text("installation_note", "Montaj", "Completează „Montaj: …”."),
      text("deposit_pct", "Avans (%)"),
      textarea("mattresses_note", "Saltele", "Răspunsul din Întrebări frecvente la „Vindeți și saltele?”."),
    ],
  },
  {
    title: "Prețuri",
    fields: [
      {
        key: "show_prices",
        label: "Arată prețurile orientative pe site",
        kind: "boolean",
        maxLength: SETTINGS_MAX.boolean,
      },
    ],
  },
  {
    title: "Atelier",
    fields: [
      textarea("structure_text", "Structura"),
      textarea("slats_text", "Lamelele"),
      textarea("foam_text", "Burete"),
      textarea("fabrics_text", "Stofe și furnizori"),
      text("founded_year", "Anul înființării"),
      text("team_size", "Echipa"),
      textarea("story_text", "Povestea atelierului"),
    ],
  },
  {
    title: "Pagina Materiale",
    fields: [text("leg_height_cm", "Înălțimea picioarelor (cm)"), text("oil_refresh_interval", "Reîmprospătarea uleiului")],
  },
];

/** Every field in form order; the schema's shape and the focus order of the form. */
export const SETTINGS_FIELDS: readonly SettingsField[] = SETTINGS_GROUPS.flatMap((group) => group.fields);
