// Site settings. In production the values come from `settings.data` in Supabase
// (PR-5); until then every page reads this seed. Each `[...]` string is the exact
// placeholder from docs/DESIGN.md §8 and is replaced with the workshop's value in
// PR-7. Nothing here is invented: an empty string means "not provided yet" and
// the component that shows it hides itself.
export interface Settings {
  // Company and contact (docs/LISTA-ATELIER.md §1)
  workshop_name: string;
  legal_name: string;
  cui: string;
  reg_com: string;
  registered_office: string;
  address: string;
  city: string;
  phone_public: string;
  /** International number without "+", e.g. 40722123456. Empty hides every WhatsApp button. */
  whatsapp_number: string;
  email_public: string;
  hours: string;
  /** Completes "În atelier, …" and "vizite …" (e.g. "cu programare"). */
  visits_note: string;
  instagram_url: string;
  facebook_url: string;
  google_profile_url: string;
  /** Shown only when both rating and count are filled in. */
  google_rating: string;
  google_reviews_count: string;

  // Promises and terms (LISTA §2–§3)
  /** e.g. "24 de ore": "răspundem în {response_time}", "Te sunăm în {response_time}". */
  response_time: string;
  /** e.g. "4–6 săptămâni". */
  lead_time: string;
  warranty_structure_years: string;
  warranty_upholstery_years: string;
  delivery_zone: string;
  /** FAQ answer: where the workshop delivers and installs, and what transport costs. */
  delivery_note: string;
  /** Completes "Măsurători: …". */
  measurement_note: string;
  /** Completes "Ofertă în {offer_days} zile lucrătoare". */
  offer_days: string;
  /** Completes "Montaj: …". */
  installation_note: string;
  deposit_pct: string;
  /** FAQ answer to „Vindeți și saltele?”. */
  mattresses_note: string;

  // Prices
  show_prices: boolean;

  // Atelier
  structure_text: string;
  slats_text: string;
  foam_text: string;
  fabrics_text: string;
  founded_year: string;
  team_size: string;
  story_text: string;
  /** Path of the FOTO 08 photo in the media bucket (site/…); "" shows the placeholder. */
  atelier_photo_path: string;

  // Materials page
  leg_height_cm: string;
  oil_refresh_interval: string;
}

export const SEED_SETTINGS: Settings = {
  workshop_name: "[Nume atelier]",
  legal_name: "[Denumire firmă SRL]",
  cui: "[___]",
  reg_com: "[J__/____/____]",
  registered_office: "[Sediul social]",
  address: "[Strada, nr., Localitate]",
  city: "[Localitate]",
  phone_public: "[07xx xxx xxx]",
  whatsapp_number: "",
  email_public: "[contact@domeniu.ro]",
  hours: "[Luni–Vineri, 9:00–18:00]",
  visits_note: "[cu programare]",
  instagram_url: "",
  facebook_url: "",
  google_profile_url: "",
  google_rating: "",
  google_reviews_count: "",

  response_time: "[24 de ore]",
  lead_time: "[4–6] săptămâni",
  warranty_structure_years: "[X]",
  warranty_upholstery_years: "[Y]",
  delivery_zone: "[Zona: oraș, județ, țară]",
  delivery_note: "[Zonele în care livrați și montați, și cât costă transportul.]",
  measurement_note: "[gratuit în Localitate]",
  offer_days: "[X]",
  installation_note: "[inclus în zona X]",
  deposit_pct: "[X]",
  mattresses_note: "[Da / nu. Dacă da: ce tipuri și de la ce producători.]",

  show_prices: false,

  structure_text: "[Lemn masiv de fag / pin uscat / alt material]",
  slats_text: "[Lamele de fag curbate, cu reglaj / fixă]",
  foam_text: "[Densitate, tip]",
  fabrics_text: "[Furnizori, colecții]",
  founded_year: "[anul]",
  team_size: "[X]",
  story_text: "[Una-două fraze despre ce vă diferențiază.]",
  atelier_photo_path: "",

  leg_height_cm: "[12]",
  oil_refresh_interval: "[o dată pe an]",
};
