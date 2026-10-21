import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import type { LeadRow } from "@/lib/leads/types";
import { clientSubject } from "@/lib/notify/subjects";
import {
  colors,
  DRAWING_ATTACHED_NOTE,
  EmailShell,
  Eyebrow,
  isReal,
  KIND_LABELS,
  leadTicketRows,
  styles,
  TicketCard,
} from "./shared";

export interface LeadConfirmationProps {
  lead: LeadRow;
  workshopName: string;
  /** settings.response_time, e.g. „24 de ore”. */
  responseTime: string;
  /** DESIGN §5.6 rows for a configurator lead. */
  ticketRows?: { k: string; v: string }[];
  shareUrl?: string;
  phonePublic: string;
  emailPublic: string;
  /** True when the drawing PNG travels with this email (PR-10), so the body says so. */
  drawingAttached?: boolean;
}

/** DESIGN §4.2, the three steps after a request. */
export function nextSteps(responseTime: string): string[] {
  return [
    `Te sunăm în ${responseTime} să clarificăm detaliile.`,
    "Venim la măsurători sau confirmăm dimensiunile cu tine.",
    "Primești desenul final și prețul, în scris.",
  ];
}

// ARHITECTURA §6.4, LeadConfirmation: the thanks, the three next steps, the
// ticket, the configuration link and the workshop's contact. Reply-to is the
// workshop.
export function LeadConfirmation({
  lead,
  workshopName,
  responseTime,
  ticketRows,
  shareUrl,
  phonePublic,
  emailPublic,
  drawingAttached,
}: LeadConfirmationProps) {
  const kindLabel = KIND_LABELS[lead.kind];
  const eyebrow = lead.config_code ? `Configurație trimisă · ${lead.config_code}` : "Cerere trimisă";

  return (
    <EmailShell preview={clientSubject(lead)}>
      <Eyebrow accent>{eyebrow}</Eyebrow>
      <Heading as="h1" style={styles.h1}>
        {`Mulțumim! Te sunăm în ${responseTime}.`}
      </Heading>

      <Section style={{ margin: "0 0 20px" }}>
        <Heading as="h2" style={styles.h2}>
          Primești oferta finală după o discuție scurtă.
        </Heading>
        <table
          className="ticket"
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: "collapse", width: "100%" }}
        >
          <tbody>
            {nextSteps(responseTime).map((step, i) => (
              <tr key={step}>
                <td
                  style={{
                    padding: "10px 14px 10px 0",
                    verticalAlign: "top",
                    fontFamily: styles.mono.fontFamily,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: colors.accent,
                    borderBottom: `1px solid ${colors.rule}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td
                  style={{
                    padding: "10px 0",
                    verticalAlign: "top",
                    fontSize: 16,
                    lineHeight: 1.55,
                    color: colors.ink,
                    borderBottom: `1px solid ${colors.rule}`,
                  }}
                >
                  {step}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <TicketCard title={kindLabel} number={lead.config_code} rows={leadTicketRows(lead)} />
      {ticketRows ? <TicketCard title="Fișă de configurare" number={lead.config_code} rows={ticketRows} /> : null}
      {drawingAttached ? <Text style={styles.mono}>{DRAWING_ATTACHED_NOTE}</Text> : null}

      {shareUrl ? (
        <Text style={styles.paragraph}>
          <Link href={shareUrl} style={styles.link}>
            Deschide configurația
          </Link>
        </Text>
      ) : null}

      <Hr style={{ borderColor: colors.rule, margin: "8px 0 20px" }} />
      <Section>
        <Heading as="h2" style={styles.h2}>
          {workshopName}
        </Heading>
        <table className="ticket" role="presentation" cellPadding={0} cellSpacing={0} style={styles.ticketTable}>
          <tbody>
            <tr>
              <td style={styles.ticketKey}>Telefon</td>
              <td style={styles.ticketValue}>
                {isReal(phonePublic) ? (
                  <Link href={`tel:${phonePublic.replace(/\s+/g, "")}`} style={styles.link}>
                    {phonePublic}
                  </Link>
                ) : (
                  phonePublic
                )}
              </td>
            </tr>
            <tr>
              <td style={styles.ticketKey}>Email</td>
              <td style={styles.ticketValue}>
                {isReal(emailPublic) ? (
                  <Link href={`mailto:${emailPublic}`} style={styles.link}>
                    {emailPublic}
                  </Link>
                ) : (
                  emailPublic
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
    </EmailShell>
  );
}

export default LeadConfirmation;
