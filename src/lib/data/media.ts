import { supabaseUrl } from "@/lib/supabase/env";

// The `media` bucket is public (supabase/migrations/20261014151458_content.sql),
// so a photo's URL is just the storage path under the project's URL. The env is
// read at call time; without it (a build with no variables) there is no URL and
// the FOTO placeholder shows instead, so this returns undefined rather than throw.
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return undefined;
  let base: string;
  try {
    base = supabaseUrl();
  } catch {
    return undefined;
  }
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/media/${segments.map(encodeURIComponent).join("/")}`;
}
