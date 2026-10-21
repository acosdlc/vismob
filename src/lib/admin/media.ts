// The site's photos (swatches, bases, later projects) live in the public `media`
// bucket (supabase/migrations/20261014151458_content.sql). The admin uploads them
// from the browser under the admin_all_media policy (ARHITECTURA §8) and the
// Server Actions store only the object path. Pure: paths and checks, no Supabase.

export const MEDIA_BUCKET = "media";

/** One folder per table (or settings slot) that carries a photo. */
export const MEDIA_FOLDERS = ["materials", "bases", "projects", "site"] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

/** The browser-side resize (browser-image-compression) before the upload. */
export const MEDIA_UPLOAD = {
  /** Longest side after the resize; swatches are shown at 150px, bases at 4:3 up to ~600px. */
  maxSidePx: 1600,
  quality: 0.85,
  /** What the bucket accepts (10 MB); the resize keeps every photo far under it. */
  maxBytes: 10 * 1024 * 1024,
  accept: "image/jpeg,image/png,image/webp,image/avif",
  mime: "image/webp",
  extension: "webp",
} as const;

/** The two hidden inputs a PhotoField posts: the path to store ("" = none) and the path the form loaded with. */
export interface PhotoFieldNames {
  path: string;
  before: string;
}

/** The default names; a form with several photos, or a settings key, passes its own (see photoFieldNames). */
export const PHOTO_FIELDS: PhotoFieldNames = {
  path: "photo_path",
  before: "photo_path_before",
};

/** The input names of a PhotoField bound to a specific field, e.g. `atelier_photo_path` / `atelier_photo_path_before`. */
export function photoFieldNames(field: string): PhotoFieldNames {
  return { path: field, before: `${field}_before` };
}

/**
 * `materials/ct-verde-1792569508760.webp`: the folder, a slug and a timestamp, so a
 * replaced photo gets a new URL (the public bucket URL is cached by browsers and CDNs).
 */
export function mediaObjectPath(folder: MediaFolder, slug: string, stamp: number): string {
  return `${folder}/${mediaSlug(slug)}-${Math.trunc(stamp)}.${MEDIA_UPLOAD.extension}`;
}

/** The slug part of an object name: lowercase ASCII letters, digits and dashes, at most 60 characters. */
export function mediaSlug(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "foto";
}

const MEDIA_PATH = /^(materials|bases|projects|site)\/[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?-\d{10,16}\.webp$/;

/** Whether a posted path is one PhotoField produces, optionally in a given folder: nothing else may be stored. */
export function isMediaPath(path: unknown, folder?: MediaFolder): path is string {
  if (typeof path !== "string" || !MEDIA_PATH.test(path)) return false;
  return folder === undefined || path.startsWith(`${folder}/`);
}

/** What a storage client offers for the removal; the real one is `supabase.storage`. */
export interface MediaStorage {
  from(bucket: string): { remove(paths: string[]): Promise<{ error: { message: string } | null }> };
}

/**
 * Reads the two hidden inputs of a PhotoField: the path to store (null for none) and
 * the object to remove once the row is saved (the previous photo, when it changed).
 * A path that is not a PhotoField path is refused as `invalid`.
 */
export function photoChange(
  formData: FormData,
  folder: MediaFolder,
  names: PhotoFieldNames = PHOTO_FIELDS,
): { ok: true; path: string | null; remove: string | null } | { ok: false } {
  const path = formData.get(names.path);
  const before = formData.get(names.before);
  const next = typeof path === "string" && path !== "" ? path : null;
  const previous = typeof before === "string" && before !== "" ? before : null;
  if (next !== null && !isMediaPath(next, folder)) return { ok: false };
  if (previous !== null && !isMediaPath(previous, folder)) return { ok: false };
  return { ok: true, path: next, remove: previous !== null && previous !== next ? previous : null };
}

/** Removes one object of the `media` bucket; a failure is logged, never fatal (the row is already saved). */
export async function removeMediaObject(storage: MediaStorage, path: string | null): Promise<void> {
  if (!path) return;
  try {
    const { error } = await storage.from(MEDIA_BUCKET).remove([path]);
    if (error) console.error(`media: could not remove ${path}: ${error.message}`);
  } catch (err) {
    console.error(`media: could not remove ${path}`, err);
  }
}
