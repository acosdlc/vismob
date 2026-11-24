"use client";

import imageCompression from "browser-image-compression";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";
import { Field, FieldError, FileInput, Label } from "@/components/site/form";
import {
  MEDIA_BUCKET,
  MEDIA_UPLOAD,
  mediaObjectPath,
  PHOTO_FIELDS,
  removeMediaObject,
  type MediaFolder,
  type MediaStorage,
  type PhotoFieldNames,
} from "@/lib/admin/media";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { mediaUrl } from "@/lib/data/media";
import { createClient } from "@/lib/supabase/client";

export interface PhotoFieldProps {
  /** The bucket folder of the row's table. */
  folder: MediaFolder;
  /** The object name's slug: the row id, or a random uuid for a row that has no id yet. */
  slug: string;
  /** The path stored on the row when the form loaded; null when it has no photo. */
  currentPath: string | null;
  label: string;
  /** One sentence on the expected photo, e.g. „Pătrată, cel puțin 600 px.”. */
  hint?: string;
  /** The preview box: swatches are square, bases 4:3. */
  ratio?: "1:1" | "4:3";
  id?: string;
  /** A server-side error for the photo (the action's `fieldErrors.photo_path`). */
  error?: string;
  /** The hidden inputs' names; the default PHOTO_FIELDS serves a form with one photo. */
  names?: PhotoFieldNames;
  /** Blocks picking and removing (a locked form, a block whose save is on its way): an upload the form could never save would only orphan an object. The hidden inputs still post. */
  disabled?: boolean;
  /** Tells the form while a photo is still uploading, so it can hold the submit. */
  onUploadingChange?: (uploading: boolean) => void;
  /** Tells the form that „Șterge poza” was pressed: a click, so no change event reaches the form's own `onChange` (a picked file does). */
  onRemove?: () => void;
}

export const PHOTO_TEXTS = {
  uploading: "Se încarcă…",
  uploaded: "Poza e încărcată; apare pe site după ce salvezi.",
  removed: "Poza se șterge când salvezi.",
  failed: "Nu am putut încărca poza. Încearcă din nou.",
  /** For a photo still over MEDIA_UPLOAD.maxBytes after the resize: trying again cannot help, so the message names the limit. */
  tooLarge: `Poza are peste ${MEDIA_UPLOAD.maxBytes / (1024 * 1024)} MB. Alege un fișier mai mic.`,
  undecodable: "Nu am putut citi fișierul. Alege un JPEG, PNG, WebP sau AVIF.",
  remove: "Șterge poza",
  none: "Fără poză",
} as const;

type Status = "idle" | "uploading" | "uploaded" | "removed" | "error";

/** The photo resized and re-encoded as WebP, or null when the browser cannot decode it. */
async function compress(file: File): Promise<File | null> {
  try {
    // Main thread: the library's web worker loads itself from a CDN, which the CSP refuses.
    return await imageCompression(file, {
      maxWidthOrHeight: MEDIA_UPLOAD.maxSidePx,
      initialQuality: MEDIA_UPLOAD.quality,
      fileType: MEDIA_UPLOAD.mime,
      useWebWorker: false,
    });
  } catch {
    return null;
  }
}

/**
 * Whether Storage refused the upload because of who is asking: the session is gone (signed out
 * in another tab, ended at Supabase) or the account has no admin role (policy admin_all_media).
 * Storage answers both with HTTP 400 and `statusCode: "403"` in the body; a gateway that turns
 * the key away before Storage sees it answers 401 or 403 itself. Trying again cannot help then,
 * so the field gives the text the saves give (ADMIN_MESSAGES.forbidden).
 */
function refusedForAccess(error: { status?: number; statusCode?: string }): boolean {
  return error.statusCode === "403" || error.status === 403 || error.status === 401;
}

/**
 * Takes out of the bucket uploads that are on no row and can reach none any more. Best effort:
 * a failure is logged and the object only stays where it was.
 */
function removeUploads(paths: readonly string[]): void {
  let storage: MediaStorage;
  try {
    storage = createClient().storage;
  } catch (err) {
    console.error("PhotoField", err);
    return;
  }
  for (const path of paths) void removeMediaObject(storage, path);
}

// ARHITECTURA §8 „Poze”: the photo is resized in the browser and goes straight to the
// public `media` bucket through the signed-in admin's client (policy admin_all_media);
// the form then posts only the object path (PHOTO_FIELDS) and the Server Action stores
// it and removes the photo it replaced. Every upload gets a new name, so the pages link
// to a new URL and no cache serves the old picture in the new one's place. The old URL
// is another matter: caches go on answering at it after the object is removed, for as
// long as the lifetime it was uploaded with says, so that is kept short (see the upload).
// The file input has no `name`: without JavaScript the form simply keeps the photo it had.
//
// An upload that no submit carried is on no row, and the action only ever learns the path
// the form loaded with and the one it posts: nothing else would remove it. So the field
// takes such an upload out of the bucket itself when another pick replaces it or „Șterge
// poza” drops it (`unsent`, `abandoned`). It never removes a photo a row may store:
// - not the stored photo: the action removes that one, once the row is saved;
// - not an upload a submit has carried: from then on a row may store it, whatever the
//   answer was (a save still on its way, one that failed halfway, an answer that was lost).
// A pick still in the field when the screen is left stays in the bucket: the router keeps
// the screen as it was, and its form can still be saved.
export function PhotoField({
  folder,
  slug,
  currentPath,
  label,
  hint,
  ratio = "1:1",
  id,
  error,
  names = PHOTO_FIELDS,
  disabled = false,
  onUploadingChange,
  onRemove,
}: PhotoFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? `${generatedId}-poza`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const [path, setPath] = useState<string | null>(currentPath);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  /** The upload the hidden input posts that no submit of its form has carried yet. */
  const unsent = useRef<string | null>(null);
  /** Such uploads the field has given up: they go once the hidden input has stopped posting them. */
  const abandoned = useRef<string[]>([]);
  const pathInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = pathInput.current?.form;
    if (!form) return;
    // A submit carries whatever the hidden input holds at that moment: nothing uploaded up
    // to here is the field's to remove any more.
    const sent = () => {
      unsent.current = null;
      abandoned.current = [];
    };
    // Capture: the form's own handler may stop the event, and the post goes out all the same.
    form.addEventListener("submit", sent, true);
    return () => form.removeEventListener("submit", sent, true);
  }, []);

  // The removal waits for the render that changed the path: until the hidden input is
  // rewritten, a submit would still carry the upload being given up (and the listener above
  // then takes it off the list). The input itself is read, not `path`, so an object goes
  // only once no submit can post it any more.
  useEffect(() => {
    const posted = pathInput.current?.value;
    const gone = abandoned.current.filter((upload) => upload !== posted);
    if (gone.length === 0) return;
    abandoned.current = abandoned.current.filter((upload) => upload === posted);
    removeUploads(gone);
  }, [path]);

  /** Gives up the upload that no submit has carried, if the field holds one. */
  function abandonUnsent() {
    if (unsent.current) abandoned.current.push(unsent.current);
    unsent.current = null;
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // The selection lives in `path`, never in the input, so the input can be reused.
    input.value = "";
    if (!file) return;

    setStatus("uploading");
    setMessage(null);
    onUploadingChange?.(true);
    try {
      const resized = await compress(file);
      if (!resized) {
        setStatus("error");
        setMessage(PHOTO_TEXTS.undecodable);
        return;
      }
      // The bucket's limit is on what it stores, so it is the resized file that is measured:
      // a camera's original, often over that limit, comes out of the resize far under it.
      if (resized.size > MEDIA_UPLOAD.maxBytes) {
        setStatus("error");
        setMessage(PHOTO_TEXTS.tooLarge);
        return;
      }
      const objectPath = mediaObjectPath(folder, slug, Date.now());
      // One hour, not a year: this is how long caches go on serving a photo after it was
      // removed. next/image keeps its optimized copies for the larger of this and its own
      // minimum (images.minimumCacheTTL, 4 hours by default), and nothing purges them.
      const { error: uploadError } = await createClient()
        .storage.from(MEDIA_BUCKET)
        .upload(objectPath, resized, { contentType: MEDIA_UPLOAD.mime, cacheControl: "3600", upsert: false });
      if (uploadError) {
        console.error(`PhotoField: ${uploadError.message}`);
        setStatus("error");
        setMessage(refusedForAccess(uploadError) ? ADMIN_MESSAGES.forbidden : PHOTO_TEXTS.failed);
        return;
      }
      // Only now: had this upload failed, the field would still post the earlier pick.
      abandonUnsent();
      unsent.current = objectPath;
      setPath(objectPath);
      setStatus("uploaded");
      setMessage(PHOTO_TEXTS.uploaded);
    } catch (err) {
      console.error("PhotoField", err);
      setStatus("error");
      setMessage(ADMIN_MESSAGES.unavailable);
    } finally {
      onUploadingChange?.(false);
    }
  }

  function remove() {
    abandonUnsent();
    setPath(null);
    setStatus("removed");
    setMessage(PHOTO_TEXTS.removed);
    onRemove?.();
  }

  const src = mediaUrl(path);
  const uploading = status === "uploading";

  return (
    // tabIndex -1: focusFirstInvalid() lands on this wrapper when the server refuses the path (the inputs are hidden).
    <Field data-field={names.path} tabIndex={-1} className="outline-none">
      <Label htmlFor={fieldId}>{label}</Label>
      <input ref={pathInput} type="hidden" name={names.path} value={path ?? ""} />
      <input type="hidden" name={names.before} value={currentPath ?? ""} />
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cx(
            "relative w-40 shrink-0 overflow-hidden border border-rule bg-card",
            ratio === "1:1" ? "aspect-square" : "aspect-[4/3]",
          )}
        >
          {src ? (
            // A freshly uploaded object in a public bucket, shown only to the admin: a plain
            // <img>, next/image's optimisation and remote-pattern check bring nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="mono-12 absolute inset-0 flex items-center justify-center text-muted">{PHOTO_TEXTS.none}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <FileInput
            id={fieldId}
            accept={MEDIA_UPLOAD.accept}
            disabled={uploading || disabled}
            invalid={Boolean(error)}
            aria-describedby={hintId}
            aria-busy={uploading || undefined}
            onChange={onChange}
          />
          {hint && (
            <p id={hintId} className="text-[14px] leading-[1.4] text-muted">
              {hint}
            </p>
          )}
          {path && !uploading && !disabled && (
            <div>
              <Button type="button" variant="secondary" size="header" onClick={remove}>
                {PHOTO_TEXTS.remove}
              </Button>
            </div>
          )}
          {uploading && (
            <p className="mono-13 text-muted" role="status">
              {PHOTO_TEXTS.uploading}
            </p>
          )}
          {/* „…după ce salvezi” and „…când salvezi” speak of a save still to come: once the stored
              path is the field's own, that save went through and they have nothing left to say.
              An error speaks of the file that was picked and stays until the field is used again. */}
          {message && !uploading && (status === "error" || path !== currentPath) && (
            <Notice tone={status === "error" ? "error" : "info"}>{message}</Notice>
          )}
        </div>
      </div>
      <FieldError fieldId={fieldId}>{error}</FieldError>
    </Field>
  );
}
