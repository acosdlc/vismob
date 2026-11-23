import "server-only";
import type { ReactElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { PLAIN_TEXT_OPTIONS } from "@/emails/shared";
import { environment, optionalEnv, requireEnv } from "@/lib/env";

// The one place that talks to Resend (CLAUDE.md rule 5). Reads its variables at
// call time, so the app builds with none of them set. With NOTIFY_DRY_RUN=1, or
// outside production without RESEND_API_KEY, it only logs the recipient and the
// subject. Production without the key fails the send instead, like production
// without EMAIL_FROM: a dry run there is journaled as a sent email, so nothing
// is retried and nobody is told.

export interface SendEmailInput {
  to: string;
  subject: string;
  react: ReactElement;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
}

export type SendEmailResult = { ok: true; id?: string; dryRun?: boolean } | { ok: false; error: string };

/** Sender used outside production until EMAIL_FROM is set (Resend's shared test sender). */
export const FALLBACK_FROM = "VisMob <onboarding@resend.dev>";

/** `EMAIL_FROM`, or the Resend test sender outside production. Production must set it. */
export function fromAddress(): string {
  const explicit = optionalEnv("EMAIL_FROM");
  if (explicit) return explicit;
  if (environment() === "production") {
    throw new Error(
      "Missing environment variable EMAIL_FROM. Add it on the Vercel project's Environment Variables page.",
    );
  }
  return FALLBACK_FROM;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    // NOTIFY_DRY_RUN=1 is asked for, so it holds in every environment. A missing
    // key is a dry run only outside production; in production `requireEnv` throws
    // and the catch below answers with its text, which the caller logs and
    // journals as a failed send for the retry cron.
    const dryRun = optionalEnv("NOTIFY_DRY_RUN") === "1";
    if (!dryRun && environment() === "production") requireEnv("RESEND_API_KEY");
    const apiKey = optionalEnv("RESEND_API_KEY");
    if (dryRun || !apiKey) {
      console.info(`[notify] dry run: „${input.subject}” → ${input.to}`);
      return { ok: true, dryRun: true };
    }

    const from = fromAddress();
    const [html, text] = await Promise.all([
      render(input.react),
      render(input.react, PLAIN_TEXT_OPTIONS),
    ]);

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html,
      text,
      replyTo: input.replyTo,
      attachments: input.attachments,
    });
    if (error) return { ok: false, error: `${error.name}: ${error.message}` };
    return { ok: true, id: data.id };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
