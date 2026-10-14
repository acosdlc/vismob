import type { LeadRow } from "@/lib/leads/types";

// Email subjects (docs/ARHITECTURA.md §6.4). Pure: the dispatcher and the
// emails' preview lines share them. Diacritics pass through untouched.

export type SubjectLead = Pick<LeadRow, "kind" | "name" | "city" | "config_code"> &
  Partial<Pick<LeadRow, "sample_material_ids">>;

const SEP = " · ";

/** One line for a mail header: control characters (CR, LF, …) become spaces, runs of spaces collapse. */
function header(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** „{Nume}, {Oraș}” — the city only when the client gave one. */
function who(lead: Pick<LeadRow, "name" | "city">): string {
  const name = header(lead.name);
  const city = header(lead.city);
  return city ? `${name}, ${city}` : name;
}

/**
 * To the workshop:
 * - configurator (a code exists): „Cerere nouă · {cod} · {Nume}, {Oraș}”
 * - contact: „Cerere nouă · {Nume}, {Oraș}”
 * - mostre: „Mostre de trimis · {n} buc. · {Nume}, {Oraș}” (the count only when the ids are known)
 */
export function workshopSubject(lead: SubjectLead): string {
  if (lead.kind === "mostre") {
    const n = lead.sample_material_ids?.length;
    return ["Mostre de trimis", n ? `${n} buc.` : null, who(lead)].filter(Boolean).join(SEP);
  }
  return ["Cerere nouă", header(lead.config_code), who(lead)].filter(Boolean).join(SEP);
}

/**
 * To the client: „Am primit cererea ta · {cod}” (the code only when there is
 * one); for samples „Pregătim mostrele tale”.
 */
export function clientSubject(lead: Pick<LeadRow, "kind" | "config_code">): string {
  if (lead.kind === "mostre") return "Pregătim mostrele tale";
  return ["Am primit cererea ta", header(lead.config_code)].filter(Boolean).join(SEP);
}
