import "server-only";

// Server-side configuration, read at call time so the app builds with nothing
// set (CLAUDE.md). Secrets never leave this module's callers on the server.
export type ServerEnvName =
  | "SUPABASE_SECRET_KEY"
  | "RESEND_API_KEY"
  | "EMAIL_FROM"
  | "NOTIFY_EMAIL"
  | "NOTIFY_DRY_RUN"
  | "TURNSTILE_SECRET_KEY"
  | "IP_HASH_SALT"
  | "FORM_HMAC_SECRET"
  | "REVALIDATE_SECRET";

/** The variable's value, or an Error naming it (the Vercel env page is where it is set). */
export function requireEnv(name: ServerEnvName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it on the Vercel project's Environment Variables page.`,
    );
  }
  return value;
}

export function optionalEnv(name: ServerEnvName): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

/** "production" | "preview" | "development", or "local" outside Vercel. */
export function environment(): string {
  return process.env.VERCEL_ENV ?? "local";
}
