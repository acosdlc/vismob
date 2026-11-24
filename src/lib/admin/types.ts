import type { FieldErrors, LeadKind } from "@/lib/leads/types";
import type { Database } from "@/lib/supabase/database.types";

// Shared contract of the admin panel (docs/ARHITECTURA.md §8, docs/PLAN.md PR-7):
// the state every admin Server Action returns, its texts, the lead labels and
// the navigation. Pure: Client Components import it too.

export type LeadStatus = Database["public"]["Enums"]["lead_status"];

/** The state `useActionState` holds for every admin form. */
export type AdminActionState =
  | { status: "idle" }
  | {
      status: "ok";
      message: string;
      /** saveSettings only: the fingerprint of the row as that save left it; the Setări form posts it with its next save. */
      fingerprint?: string;
    }
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
  /**
   * For a call that brought no answer (useGuardedActionState), where `generic` would
   * mislead: the save may have gone through all the same, and after a deployment a retry
   * from the same page can never reach the action. So it says what to do in both cases.
   */
  noAnswer: "Nu am primit răspuns la salvare. Verifică legătura la internet și încearcă din nou. Dacă se repetă, copiază ce ai scris și reîncarcă pagina.",
  /**
   * The same on a screen that creates a record: the first try may have created it, and a
   * second would add it twice. It ends as `noAnswer` does, because after a deployment a
   * retry cannot reach the action from that page either.
   */
  noAnswerNew: "Nu am primit răspuns la salvare. Înainte să încerci din nou, verifică în listă, într-o filă nouă, dacă nu s-a adăugat deja. Dacă se repetă, copiază ce ai scris și reîncarcă pagina.",
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
  { label: "Lucrări", href: "/admin/lucrari" },
  { label: "Recenzii", href: "/admin/recenzii" },
  { label: "Setări", href: "/admin/setari" },
] as const;
