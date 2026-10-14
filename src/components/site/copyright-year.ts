import { cacheLife } from "next/cache";

// With `cacheComponents` on, `new Date()` inside a prerendered Server Component is a build
// error (Next docs: functions/io.md). Capturing it in a cached scope, refreshed daily, keeps
// the footer in the static shell.
export async function getCopyrightYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
