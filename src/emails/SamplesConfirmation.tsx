import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import type { SampleItem } from "@/components/materials/types";
import type { LeadRow } from "@/lib/leads/types";
import { samplesDeliveryNote } from "@/lib/materials/delivery-note";
import { clientSubject } from "@/lib/notify/subjects";
import { siteUrl } from "@/lib/site-url";
import { colors, EmailShell, Eyebrow, isReal, KIND_LABELS, styles, TicketCard, type TicketRow } from "./shared";

export interface SamplesConfirmationProps {
  lead: LeadRow;
  /** The chosen samples resolved against the catalogue, in box order. */
  items: SampleItem[];
  workshopName: string;
  /** settings.samples_delivery, e.g. „2–3 zile lucrătoare”. */
  samplesDelivery: string;
  /** settings.samples_free, e.g. „gratuit”. */
  samplesFree: string;
  phonePublic?: string;
  emailPublic?: string;
}

export { samplesDeliveryNote };

/** The list the client reads: the name on the left, the family (and code) on the right. */
export function clientSampleRows(items: SampleItem[]): TicketRow[] {
  return items.map((item) => ({ k: item.code, v: `${item.name} · ${item.familyName}` }));
}

// ARHITECTURA §6.4, SamplesConfirmation („Pregătim mostrele tale”): the list of samples,
// the delivery note, the line that the workshop calls to confirm the address, and the
// workshop's contact. Reply-to is the workshop.
export function SamplesConfirmation({
  lead,
  items,
  workshopName,
  samplesDelivery,
  samplesFree,
  phonePublic,
  emailPublic,
}: SamplesConfirmationProps) {
  const contactRows: TicketRow[] = [];
  if (phonePublic) {
    contactRows.push({
      k: "Telefon",
      v: isReal(phonePublic) ? (
        <Link href={`tel:${phonePublic.replace(/\s+/g, "")}`} style={styles.link}>
          {phonePublic}
        </Link>
      ) : (
        phonePublic
      ),
    });
  }
  if (emailPublic) {
    contactRows.push({
      k: "Email",
      v: isReal(emailPublic) ? (
        <Link href={`mailto:${emailPublic}`} style={styles.link}>
          {emailPublic}
        </Link>
      ) : (
        emailPublic
      ),
    });
  }

  return (
    <EmailShell preview={clientSubject(lead)}>
      <Eyebrow accent>{KIND_LABELS.mostre}</Eyebrow>
      <Heading as="h1" style={styles.h1}>
        Gata! Pregătim cutia.
      </Heading>
      <Text style={styles.paragraph}>Te sunăm să confirmăm adresa.</Text>

      <TicketCard title="Cutia cu mostre" number={`${items.length} buc.`} rows={clientSampleRows(items)} />

      <Text style={styles.mono}>{samplesDeliveryNote(samplesDelivery, samplesFree)}</Text>
      {lead.address ? (
        <Text style={{ ...styles.paragraph, whiteSpace: "pre-wrap" }}>
          <span style={{ color: colors.muted }}>Adresa de livrare: </span>
          {lead.address}
        </Text>
      ) : null}

      <Text style={styles.paragraph}>
        Între timp, încearcă materialele pe patul tău în{" "}
        <Link href={`${siteUrl()}/configurator`} style={styles.link}>
          configurator
        </Link>
        .
      </Text>

      <Hr style={{ borderColor: colors.rule, margin: "8px 0 20px" }} />
      <Section>
        <Heading as="h2" style={styles.h2}>
          {workshopName}
        </Heading>
        {contactRows.length > 0 ? (
          <table className="ticket" role="presentation" cellPadding={0} cellSpacing={0} style={styles.ticketTable}>
            <tbody>
              {contactRows.map((row) => (
                <tr key={row.k}>
                  <td style={styles.ticketKey}>{row.k}</td>
                  <td style={styles.ticketValue}>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>
    </EmailShell>
  );
}

export default SamplesConfirmation;
