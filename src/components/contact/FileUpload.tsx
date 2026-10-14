"use client";

import imageCompression from "browser-image-compression";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { createUploadUrls } from "@/actions/create-upload-urls";
import { Field, FieldError, FileInput, Label } from "@/components/site/form";
import { CloseIcon } from "@/components/site/Icons";
import { FORM_FIELDS, FORM_MESSAGES, UPLOAD_LIMITS } from "@/lib/leads/types";
import { createClient } from "@/lib/supabase/client";

export type UploadStatus = "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  name: string;
  /** The `pending/<uuid>/<n>.jpg` path once the signed URL was issued. */
  path: string | null;
  status: UploadStatus;
}

export interface FileUploadProps {
  /** The field's id; the label, the error and the file input hang off it. */
  id?: string;
  /** A server-side error for the `uploads` field (the form's `fieldErrors.uploads`). */
  error?: string;
  /** Tells the form while at least one file is still uploading, so it can hold the submit. */
  onUploadingChange?: (uploading: boolean) => void;
}

// ARHITECTURA §6.1 step 2: the photos never travel through the Server Action. Each image
// is compressed in the browser (longest side 2000px, JPEG 0.8), gets a signed upload URL
// from `createUploadUrls` and goes straight to Storage under `pending/`. Only the paths
// are posted, as JSON, in the hidden `uploads` input. The file input has no `name`, so a
// submit without JavaScript simply sends the request without photos.

const STATUS_TEXT: Record<UploadStatus, string> = {
  uploading: "Se încarcă…",
  done: "Încărcată",
  error: "Eroare",
};

/** FORM_MESSAGES.uploads when the selection breaks the count or size limits, else null. */
export function uploadLimitError(existing: number, files: readonly File[]): string | null {
  if (existing + files.length > UPLOAD_LIMITS.maxFiles) return FORM_MESSAGES.uploads;
  if (files.some((file) => file.size > UPLOAD_LIMITS.maxBytes)) return FORM_MESSAGES.uploads;
  return null;
}

/**
 * The photo re-encoded as JPEG, or null when the browser cannot decode it: the signed
 * path ends in `.jpg`, so nothing else may go there. Compression runs on the main
 * thread: the library's web worker loads itself from a CDN, which the CSP refuses.
 */
async function compress(file: File): Promise<File | null> {
  try {
    return await imageCompression(file, {
      maxWidthOrHeight: UPLOAD_LIMITS.maxSidePx,
      initialQuality: UPLOAD_LIMITS.jpegQuality,
      fileType: "image/jpeg",
      useWebWorker: false,
    });
  } catch {
    return file.type === "image/jpeg" ? file : null;
  }
}

export function FileUpload({ id, error, onUploadingChange }: FileUploadProps) {
  const generatedId = useId();
  const fieldId = id ?? `${generatedId}-poze`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const uploadingCount = useRef(0);

  function setUploading(delta: number) {
    const before = uploadingCount.current;
    uploadingCount.current = Math.max(0, before + delta);
    const now = uploadingCount.current;
    if ((before === 0) !== (now === 0)) onUploadingChange?.(now > 0);
  }

  function update(itemId: string, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    // The selection is kept in `items`, never in the input, so the input can be reused.
    input.value = "";
    if (files.length === 0) return;

    const limit = uploadLimitError(items.filter((item) => item.status !== "error").length, files);
    if (limit) {
      setLocalError(limit);
      return;
    }
    setLocalError(null);

    const batch: UploadItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      path: null,
      status: "uploading",
    }));
    setItems((current) => [...current, ...batch]);
    setUploading(1);

    try {
      const compressed = await Promise.all(files.map(compress));
      // A file the browser could not decode is refused here; the others go on.
      const ready = batch.filter((item, index) => {
        if (compressed[index]) return true;
        update(item.id, { status: "error" });
        setLocalError(FORM_MESSAGES.uploads);
        return false;
      });
      if (ready.length === 0) return;

      const urls = await createUploadUrls(ready.length);
      if (!urls.ok) {
        for (const item of ready) update(item.id, { status: "error" });
        setLocalError(urls.message);
        return;
      }

      const bucket = createClient().storage.from(UPLOAD_LIMITS.bucket);
      await Promise.all(
        ready.map(async (item, index) => {
          const target = urls.uploads[index];
          const file = compressed[batch.indexOf(item)];
          if (!target || !file) {
            update(item.id, { status: "error" });
            setLocalError(FORM_MESSAGES.generic);
            return;
          }
          const { error: uploadError } = await bucket.uploadToSignedUrl(target.path, target.token, file, {
            contentType: file.type || "image/jpeg",
          });
          if (uploadError) {
            update(item.id, { status: "error" });
            setLocalError(FORM_MESSAGES.generic);
            return;
          }
          update(item.id, { status: "done", path: target.path });
        }),
      );
    } catch (caught) {
      console.error("FileUpload", caught);
      for (const item of batch) update(item.id, { status: "error" });
      setLocalError(FORM_MESSAGES.generic);
    } finally {
      setUploading(-1);
    }
  }

  function remove(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setLocalError(null);
    inputRef.current?.focus();
  }

  const message = localError ?? error;
  const donePaths = items.filter((item) => item.status === "done" && item.path).map((item) => item.path as string);

  return (
    <Field>
      <Label htmlFor={fieldId}>Poze cu camera sau cu un pat care îți place (opțional)</Label>
      <FileInput
        id={fieldId}
        ref={inputRef}
        data-field={FORM_FIELDS.uploads}
        accept={UPLOAD_LIMITS.accept}
        multiple
        invalid={Boolean(message)}
        onChange={onChange}
      />
      <ul aria-live="polite" className="flex list-none flex-col p-0">
        {items.map((item) => (
          <li key={item.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-rule">
            <span className="min-w-0 flex-1 truncate text-[15px]">{item.name}</span>
            <span className={item.status === "error" ? "mono-12 text-error" : "mono-12 text-muted"}>
              {STATUS_TEXT[item.status]}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              aria-label={`Scoate ${item.name}`}
              className="inline-flex size-11 shrink-0 items-center justify-center text-ink hover:text-accent"
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
      <FieldError fieldId={fieldId}>{message}</FieldError>
      <input type="hidden" name={FORM_FIELDS.uploads} value={JSON.stringify(donePaths)} />
    </Field>
  );
}
