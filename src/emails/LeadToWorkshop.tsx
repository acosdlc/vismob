import { Button, Heading, Hr, Link, Section, Text } from "@react-email/components";
import type { LeadRow } from "@/lib/leads/types";
import { workshopSubject } from "@/lib/notify/subjects";
import {
  colors,
  DRAWING_ATTACHED_NOTE,
  EmailShell,
  Eyebrow,
  formatDate,
  KIND_LABELS,
  leadTicketRows,
  phoneDigits,
  styles,
  TicketCard,
  type TicketRow,
} from "./shared";

export interface LeadToWorkshopProps {
  lead: LeadRow;
  workshopName: string;
  /** Signed links to the client's photos, valid 7 days. */
  photoUrls: string[];
  /** DESIGN §5.6 rows for a configurator lead; the contact rows come from `lead`. */
  ticketRows?: { k: string; v: string }[];
  /** The link that reopens the configuration („Deschide configurația”). */
  shareUrl?: string;
  /** Formatted price, e.g. „7.450 lei”; shown as the „Preț orientativ” row. */
  priceLabel?: string;
  /** True when the drawing PNG travels with this email (PR-10), so the body says so. */
  drawingAttached?: boolean;
}

// ARHITECTURA §6.4, LeadToWorkshop: the ticket, the price, the contact (tel:
// link and a WhatsApp button to the client), the message, measurements yes/no,
// the configuration link and the photo links. Reply-to is the client.
export function LeadToWorkshop({
  lead,
  workshopName,
  photoUrls,
  ticketRows,
  shareUrl,
  priceLabel,
  drawingAttached,
}: LeadToWorkshopProps) {
  const kindLabel = KIND_LABELS[lead.kind];
  const configRows: TicketRow[] | undefined = ticketRows
    ? [...ticketRows, ...(priceLabel ? [{ k: "Preț orientativ", v: priceLabel }] : [])]
    : undefined;
  const whatsapp = phoneDigits(lead.phone);
  const when = formatDate(lead.created_at);

  return (
    <EmailShell preview={workshopSubject(lead)}>
      <Eyebrow>Cerere nouă</Eyebrow>
      <Heading as="h1" style={styles.h1}>
        {kindLabel}
      </Heading>
      <Text style={styles.mono}>{[when, lead.config_code].filter(Boolean).join(" · ")}</Text>

      <TicketCard title={kindLabel} number={lead.config_code} rows={leadTicketRows(lead)} />

      {configRows ? <TicketCard title="Fișă de configurare" number={lead.config_code} rows={configRows} /> : null}
      {drawingAttached ? <Text style={styles.mono}>{DRAWING_ATTACHED_NOTE}</Text> : null}

      <Section style={{ margin: "0 0 20px" }}>
        {whatsapp.length >= 8 ? (
          <Button href={`https://wa.me/${whatsapp}`} style={styles.button}>
            WhatsApp
          </Button>
        ) : null}
        {shareUrl ? (
          <Text style={{ ...styles.paragraph, margin: "14px 0 0" }}>
            <Link href={shareUrl} style={styles.link}>
              Deschide configurația
            </Link>
          </Text>
        ) : null}
      </Section>

      {photoUrls.length > 0 ? (
        <Section style={{ margin: "0 0 20px" }}>
          <Heading as="h2" style={styles.h2}>
            Poze
          </Heading>
          {photoUrls.map((url, i) => (
            <Text key={url} style={{ ...styles.paragraph, margin: "0 0 6px" }}>
              <Link href={url} style={styles.link}>
                {`Poza ${i + 1}`}
              </Link>
            </Text>
          ))}
          <Text style={styles.mono}>Linkurile sunt valabile 7 zile.</Text>
        </Section>
      ) : null}

      <Hr style={{ borderColor: colors.rule, margin: "8px 0 0" }} />
      <Text style={styles.footer}>{workshopName}</Text>
    </EmailShell>
  );
}

export default LeadToWorkshop;
