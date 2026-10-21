import { Heading, Hr, Link, Text } from "@react-email/components";
import type { LeadRow } from "@/lib/leads/types";
import type { LeadEventType } from "@/lib/notify/dispatch";
import { colors, EmailShell, Eyebrow, styles } from "./shared";

// ARHITECTURA §6.1 step 4: after the third failed attempt to send one of the two
// lead emails, the `retry-notifications` cron sends this alert to NOTIFY_EMAIL
// (the workshop in production, the owner in preview). It names the email, the
// request, how many times it failed, the last error, and links the request in
// the admin, where the workshop can write to the client by hand.

export interface NotificationAlertProps {
  leadId: string;
  leadName: string;
  configCode?: string | null;
  type: LeadEventType;
  /** The last send error, shown verbatim in mono. */
  error: string;
  attempts: number;
  /** `${siteUrl()}/admin/cereri/${leadId}`, built by the caller. */
  adminUrl: string;
}

/** Which email failed, as the paragraph names it. */
export const FAILED_EMAIL_LABELS: Record<LeadEventType, string> = {
  email_workshop: "Emailul către atelier",
  email_client: "Emailul de confirmare către client",
};

/** One line for a mail header: control characters become spaces, runs of spaces collapse. */
function header(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** „Notificare eșuată · {cod}”, or the client's name when the request has no code. */
export function alertSubject(lead: Pick<LeadRow, "name" | "config_code">): string {
  return `Notificare eșuată · ${header(lead.config_code) || header(lead.name)}`;
}

function times(attempts: number): string {
  return attempts === 1 ? "o dată" : `de ${attempts} ori`;
}

export function NotificationAlert({ leadId, leadName, configCode, type, error, attempts, adminUrl }: NotificationAlertProps) {
  const request = configCode ? `${configCode} (${leadName})` : leadName;
  return (
    <EmailShell preview={alertSubject({ name: leadName, config_code: configCode ?? null })}>
      <Eyebrow>Alertă</Eyebrow>
      <Heading as="h1" style={styles.h1}>
        Notificare eșuată
      </Heading>
      <Text style={styles.paragraph}>
        {`${FAILED_EMAIL_LABELS[type]} pentru cererea ${request} a eșuat ${times(attempts)}. Nu se mai reîncearcă automat: deschide cererea și scrie-i clientului direct.`}
      </Text>
      <Text style={styles.mono}>{error}</Text>
      <Text style={styles.paragraph}>
        <Link href={adminUrl} style={styles.link}>
          Deschide cererea
        </Link>
      </Text>
      <Hr style={{ borderColor: colors.rule, margin: "8px 0 0" }} />
      <Text style={styles.footer}>{`Cerere ${leadId}`}</Text>
    </EmailShell>
  );
}

export default NotificationAlert;
