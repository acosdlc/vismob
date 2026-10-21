// docs/PLAN.md, principle 3: a reader that cannot reach Supabase serves its
// TypeScript seed in a build without variables and on previews, but throws in
// production, where bracket placeholders must never replace the live content.
// Inside a "use cache" scope a throw during a background revalidation keeps the
// last good entry; at build time it fails the build, which is the right signal.

/** Logs and returns null (the caller serves the seed), or throws when `VERCEL_ENV` is "production". */
export function failedRead(reader: string, cause: unknown): null {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (process.env.VERCEL_ENV === "production") {
    throw new Error(`${reader}: ${message}`, { cause });
  }
  console.error(`${reader}: serving the seed, ${message}`);
  return null;
}
