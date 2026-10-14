import { Heading, Hr, Link, Text } from "@react-email/components";
import type { SampleItem } from "@/components/materials/types";
import type { LeadRow } from "@/lib/leads/types";
import { workshopSubject } from "@/lib/notify/subjects";
import { colors, EmailShell, Eyebrow, formatDate, KIND_LABELS, styles, TicketCard, type TicketRow } from "./shared";

export interface SamplesToWorkshopProps {
  lead: LeadRow;
  /** The chosen samples resolved against the catalogue, in box order. */
  items: SampleItem[];
  workshopName: string;
}

/** „[cod furnizor]” until the catalogue carries the supplier's reference (DESIGN §8). */
export const SUPPLIER_CODE_PLACEHOLDER = "[cod furnizor]";

/**
 * The samples as ticket rows, one per envelope label: the code on the left, then
 * „{Familie}, {nume} · {cod furnizor}” (ARHITECTURA §6.3: „CT01 · Catifea, Verde sticlă · [cod furnizor]”).
 */
export function sampleRows(items: SampleItem[]): TicketRow[] {
  return items.map((item) => ({
    k: item.code,
    v: `${item.familyName}, ${item.name} · ${item.supplierCode ?? SUPPLIER_CODE_PLACEHOLDER}`,
  }));
}

// ARHITECTURA §6.3–6.4, SamplesToWorkshop: the list of codes with the names and the
// supplier codes, the delivery address, the phone (tel:) and the email (mailto:).
// Reply-to is the client.
export function SamplesToWorkshop({ lead, items, workshopName }: SamplesToWorkshopProps) {
  const when = formatDate(lead.created_at);
  const contactRows: TicketRow[] = [
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
    { k: "Adresă", v: lead.address ?? "" },
  ];

  return (
    <EmailShell preview={workshopSubject(lead)}>
      <Eyebrow>{KIND_LABELS.mostre}</Eyebrow>
      <Heading as="h1" style={styles.h1}>
        {`Mostre de trimis · ${items.length} buc.`}
      </Heading>
      <Text style={styles.mono}>{when}</Text>

      <TicketCard title="Mostre" number={`${items.length} buc.`} rows={sampleRows(items)} />
      <TicketCard title="Livrare" rows={contactRows} />

      <Hr style={{ borderColor: colors.rule, margin: "8px 0 0" }} />
      <Text style={styles.footer}>{workshopName}</Text>
    </EmailShell>
  );
}

export default SamplesToWorkshop;
