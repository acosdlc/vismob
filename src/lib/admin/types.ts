import type { FieldErrors, LeadKind } from "@/lib/leads/types";
import type { Database } from "@/lib/supabase/database.types";

// Shared contract of the admin panel (docs/ARHITECTURA.md §8, docs/PLAN.md PR-7):
// the state every admin Server Action returns, its texts, the lead labels and
// the navigation. Pure: Client Components import it too.

export type LeadStatus = Database["public"]["Enums"]["lead_status"];

/** The state `useActionState` holds for every admin form. */
export type AdminActionState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string; fieldErrors?: FieldErrors };

export const ADMIN_INITIAL_STATE: AdminActionState = { status: "idle" };

export const ADMIN_MESSAGES = {
  required: "Completează acest câmp.",
  email: "Scrie o adresă de email validă.",
  tooLong: "Textul e prea lung.",
  invalid: "Verifică câmpurile marcate.",
  credentials: "Email sau parolă greșite.",
  notAdmin: "Contul nu are drepturi de administrare. Cere accesul și intră din nou.",
  forbidden: "Sesiunea a expirat sau nu ai acces. Intră din nou în cont.",
  saved: "Salvat.",
  created: "Adăugat.",
  deleted: "Cererea a fost ștearsă.",
  removed: "Șters.",
  notFound: "Nu am găsit înregistrarea.",
  generic: "Nu am putut salva. Încearcă din nou.",
  unavailable: "Serviciul nu e configurat pe acest mediu.",
} as const;

/** In the order the status select shows them (ARHITECTURA §8). */
export const LEAD_STATUSES = ["nou", "contactat", "ofertat", "castigat", "pierdut", "spam"] as const satisfies readonly LeadStatus[];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  nou: "Nou",
  contactat: "Contactat",
  ofertat: "Ofertat",
  castigat: "Câștigat",
  pierdut: "Pierdut",
  spam: "Spam",
};

export const LEAD_KIND_LABELS: Record<LeadKind, string> = {
  contact: "Cerere de ofertă",
  configurator: "Configurator",
  // The enum still carries the value (samples left in PR-6); no new lead gets it.
  mostre: "Mostre",
};

export const ADMIN_NAV = [
  { label: "Panou", href: "/admin" },
  { label: "Cereri", href: "/admin/cereri" },
  { label: "Catalog", href: "/admin/catalog" },
  { label: "Prețuri", href: "/admin/preturi" },
  { label: "Setări", href: "/admin/setari" },
] as const;
