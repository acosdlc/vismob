import type { LeadRow } from "@/lib/leads/types";

// Email subjects (docs/ARHITECTURA.md §6.4). Pure: the dispatcher and the
// emails' preview lines share them. Diacritics pass through untouched.

export type SubjectLead = Pick<LeadRow, "kind" | "name" | "city" | "config_code">;

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
 */
export function workshopSubject(lead: SubjectLead): string {
  return ["Cerere nouă", header(lead.config_code), who(lead)].filter(Boolean).join(SEP);
}

/** To the client: „Am primit cererea ta · {cod}” (the code only when there is one). */
export function clientSubject(lead: Pick<LeadRow, "kind" | "config_code">): string {
  return ["Am primit cererea ta", header(lead.config_code)].filter(Boolean).join(SEP);
}
