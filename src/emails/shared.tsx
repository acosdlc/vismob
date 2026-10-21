import { Body, Container, Head, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { Options as RenderOptions } from "@react-email/render";
import type { CSSProperties, ReactNode } from "react";
import type { LeadKind, LeadRow } from "@/lib/leads/types";

// The site's look in email form (docs/DESIGN.md §2): paper, ink, one accent,
// a 1.5px ink border on the "workshop" pieces and DM Mono for the ticket.
// Inline styles only, no hooks: these render on the server with
// @react-email/render.

export const colors = {
  paper: "#F3F3F0",
  white: "#FFFFFF",
  ink: "#18191B",
  ink2: "#4A4D52",
  muted: "#5F6268",
  rule: "#CFD0CC",
  accent: "#1E4D3B",
  onDark: "#F3F3F0",
} as const;

/** DESIGN §2.2 fallbacks: the web fonts are not embedded in emails. */
export const fonts = {
  sans: "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "'DM Mono', ui-monospace, Menlo, monospace",
} as const;

export const styles = {
  body: { margin: 0, padding: 0, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.sans },
  container: { maxWidth: 600, margin: "0 auto", padding: "32px 16px" },
  eyebrow: {
    margin: "0 0 12px",
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1.55,
    letterSpacing: ".08em",
    textTransform: "uppercase",
    color: colors.muted,
  },
  eyebrowAccent: { color: colors.accent },
  h1: {
    margin: "0 0 16px",
    fontFamily: fonts.sans,
    fontSize: 28,
    lineHeight: 1.15,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: colors.ink,
  },
  h2: { margin: "0 0 10px", fontFamily: fonts.sans, fontSize: 19, lineHeight: 1.25, fontWeight: 600, color: colors.ink },
  paragraph: { margin: "0 0 14px", fontSize: 16, lineHeight: 1.55, color: colors.ink2 },
  mono: { margin: "0 0 14px", fontFamily: fonts.mono, fontSize: 13, lineHeight: 1.5, color: colors.muted },
  link: { color: colors.accent, fontWeight: 600, textDecoration: "underline" },
  button: {
    display: "inline-block",
    backgroundColor: colors.accent,
    color: colors.white,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: "22px",
    padding: "14px 26px",
    borderRadius: 2,
    textDecoration: "none",
  },
  card: { backgroundColor: colors.white, border: `1.5px solid ${colors.ink}`, margin: "0 0 20px" },
  cardBar: {
    backgroundColor: colors.ink,
    color: colors.onDark,
    padding: "8px 14px",
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 1.4,
    letterSpacing: ".08em",
    textTransform: "uppercase",
  },
  cardBody: { padding: 14 },
  ticketTable: { width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 13, lineHeight: 1.5 },
  ticketKey: {
    padding: "6px 16px 6px 0",
    verticalAlign: "top",
    whiteSpace: "nowrap",
    color: colors.muted,
    borderBottom: `1px dashed ${colors.rule}`,
  },
  ticketValue: {
    padding: "6px 0",
    verticalAlign: "top",
    color: colors.ink,
    borderBottom: `1px dashed ${colors.rule}`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  footer: { margin: "24px 0 0", fontFamily: fonts.mono, fontSize: 12, lineHeight: 1.55, color: colors.muted },
} satisfies Record<string, CSSProperties>;

/**
 * Options for the plain-text part: html-to-text lays out the `.ticket` tables
 * as columns instead of running their cells together.
 */
export const PLAIN_TEXT_OPTIONS = {
  plainText: true,
  htmlToTextOptions: {
    tables: [".ticket"],
    wordwrap: 100,
    // tel: and mailto: links already show their target as text.
    selectors: [
      { selector: 'a[href^="tel:"]', format: "anchor", options: { ignoreHref: true } },
      { selector: 'a[href^="mailto:"]', format: "anchor", options: { ignoreHref: true } },
    ],
  },
} satisfies RenderOptions;

/** One line under the configuration ticket when the drawing PNG is attached (PR-10). */
export const DRAWING_ATTACHED_NOTE = "Desenul la scară e atașat ca PNG.";

/** The request kind as the workshop names it. */
export const KIND_LABELS: Record<LeadKind, string> = {
  contact: "Cerere de ofertă",
  configurator: "Configurator",
  // The enum still carries this value (samples are no longer requested since PR-6); no lead gets it.
  mostre: "Mostre",
};

export interface TicketRow {
  k: string;
  v: ReactNode;
}

/** A value from `settings` is linkable only when it is not a `[...]` placeholder. */
export function isReal(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "" && !value.includes("[");
}

/** Digits of a phone number, for `tel:` and `https://wa.me/`. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** „14 octombrie 2026, 10:32” in Romania's time zone. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("ro-RO", { dateStyle: "long", timeZone: "Europe/Bucharest" }).format(date);
  const time = new Intl.DateTimeFormat("ro-RO", { timeStyle: "short", timeZone: "Europe/Bucharest" }).format(date);
  return `${day}, ${time}`;
}

/**
 * The ticket rows every lead has (ARHITECTURA §6.4: contact with `tel:`,
 * the city, the mattress size, measurements yes/no and the message).
 */
export function leadTicketRows(lead: LeadRow): TicketRow[] {
  const rows: TicketRow[] = [
    { k: "Nume", v: lead.name },
    {
      k: "Telefon",
      v: (
        <Link href={`tel:${lead.phone}`} style={styles.link}>
          {lead.phone}
        </Link>
      ),
    },
    {
      k: "Email",
      v: (
        <Link href={`mailto:${lead.email}`} style={styles.link}>
          {lead.email}
        </Link>
      ),
    },
  ];
  if (lead.city) rows.push({ k: "Localitate", v: lead.city });
  if (lead.address) rows.push({ k: "Adresă", v: lead.address });
  if (lead.mattress_size) rows.push({ k: "Saltea", v: lead.mattress_size });
  rows.push({ k: "Măsurători", v: lead.wants_measurement ? "da" : "nu" });
  if (lead.message) rows.push({ k: "Mesaj", v: lead.message });
  return rows;
}

export function EmailShell({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="ro">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>{children}</Container>
      </Body>
    </Html>
  );
}

/** DESIGN §3.6, the job ticket: ink title bar, mono rows. */
export function TicketCard({ title, number, rows }: { title: string; number?: string | null; rows: TicketRow[] }) {
  return (
    <Section style={styles.card}>
      <table
        className="ticket"
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ borderCollapse: "collapse" }}
      >
        <tbody>
          <tr>
            <td style={styles.cardBar}>{title}</td>
            {number ? <td style={{ ...styles.cardBar, textAlign: "right" }}>{number}</td> : null}
          </tr>
        </tbody>
      </table>
      <div style={styles.cardBody}>
        <table className="ticket" role="presentation" cellPadding={0} cellSpacing={0} style={styles.ticketTable}>
          <tbody>
            {rows.map((row) => (
              <tr key={row.k}>
                <td style={styles.ticketKey}>{row.k}</td>
                <td style={styles.ticketValue}>{row.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function Eyebrow({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <Text style={accent ? { ...styles.eyebrow, ...styles.eyebrowAccent } : styles.eyebrow}>{children}</Text>;
}
