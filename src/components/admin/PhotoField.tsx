"use client";

import imageCompression from "browser-image-compression";
import { useId, useState, type ChangeEvent } from "react";
import { Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";
import { Field, FieldError, FileInput, Label } from "@/components/site/form";
import {
  MEDIA_BUCKET,
  MEDIA_UPLOAD,
  mediaObjectPath,
  PHOTO_FIELDS,
  type MediaFolder,
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
  /** Blocks picking and removing (a locked form): an upload the form could never save would only orphan an object. */
  disabled?: boolean;
  /** Tells the form while a photo is still uploading, so it can hold the submit. */
  onUploadingChange?: (uploading: boolean) => void;
}

export const PHOTO_TEXTS = {
  uploading: "Se încarcă…",
  uploaded: "Poza e încărcată; apare pe site după ce salvezi.",
  removed: "Poza se șterge când salvezi.",
  failed: "Nu am putut încărca poza. Încearcă din nou.",
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

// ARHITECTURA §8 „Poze”: the photo is resized in the browser and goes straight to the
// public `media` bucket through the signed-in admin's client (policy admin_all_media);
// the form then posts only the object path (PHOTO_FIELDS) and the Server Action stores
// it and removes the photo it replaced. Every upload gets a new name, so the public URL
// changes and no cache serves the old picture. The file input has no `name`: without
// JavaScript the form simply keeps the photo it had.
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
}: PhotoFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? `${generatedId}-poza`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const [path, setPath] = useState<string | null>(currentPath);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // The selection lives in `path`, never in the input, so the input can be reused.
    input.value = "";
    if (!file) return;
    if (file.size > MEDIA_UPLOAD.maxBytes) {
      setStatus("error");
      setMessage(PHOTO_TEXTS.failed);
      return;
    }

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
      const objectPath = mediaObjectPath(folder, slug, Date.now());
      const { error: uploadError } = await createClient()
        .storage.from(MEDIA_BUCKET)
        .upload(objectPath, resized, { contentType: MEDIA_UPLOAD.mime, cacheControl: "31536000", upsert: false });
      if (uploadError) {
        console.error(`PhotoField: ${uploadError.message}`);
        setStatus("error");
        setMessage(PHOTO_TEXTS.failed);
        return;
      }
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
    setPath(null);
    setStatus("removed");
    setMessage(PHOTO_TEXTS.removed);
  }

  const src = mediaUrl(path);
  const uploading = status === "uploading";

  return (
    // tabIndex -1: focusFirstInvalid() lands on this wrapper when the server refuses the path (the inputs are hidden).
    <Field data-field={names.path} tabIndex={-1} className="outline-none">
      <Label htmlFor={fieldId}>{label}</Label>
      <input type="hidden" name={names.path} value={path ?? ""} />
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
          {message && !uploading && <Notice tone={status === "error" ? "error" : "info"}>{message}</Notice>}
        </div>
      </div>
      <FieldError fieldId={fieldId}>{error}</FieldError>
    </Field>
  );
}
