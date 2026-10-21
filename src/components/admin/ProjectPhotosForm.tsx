"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { saveProjectPhotos } from "@/actions/admin/save-project-photos";
import { PhotoField } from "@/components/admin/PhotoField";
import { AdminCard, EmptyState, Notice, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";
import { Checkbox, Field, FieldError, Input, Label } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { NEW_PHOTO_ALT_FIELD, PHOTO_ROW_ID_FIELD, photoRowFields, PROJECT_LIMITS } from "@/lib/admin/projects";
import { ADMIN_INITIAL_STATE } from "@/lib/admin/types";
import { mediaUrl } from "@/lib/data/media";
import type { FieldErrors } from "@/lib/leads/types";
import type { Tables } from "@/lib/supabase/database.types";

export type ProjectPhotosFormPhoto = Pick<Tables<"project_photos">, "id" | "path" | "alt" | "sort">;

export interface ProjectPhotosFormProps {
  projectId: string;
  /** The project's photos, in any order; the form sorts them. */
  photos: ProjectPhotosFormPhoto[];
}

export const PROJECT_PHOTOS_TEXTS = {
  /** The description of the „Poze” section on the project's screen. */
  sectionHint: "Ordinea 0 e prima. Pentru hero se folosește prima poză a proiectului din hero.",
  empty: "Nicio poză încă.",
  alt: "Text alternativ",
  sort: "Ordine",
  delete: "Șterge",
  add: "Adaugă o poză",
  newPhoto: "Poză nouă",
  newPhotoHint: "Patul în cameră, 4:3, cel puțin 1200 px pe lățime. Prima poză din ordine e cea de pe tile și din galerie.",
  newAlt: "Text alternativ pentru poza nouă",
  newAltHint: "Ce se vede în poză, pentru cititoarele de ecran și pentru Google.",
  submit: "Salvează pozele",
  submitting: "Se salvează…",
} as const;

const HINT = "text-[14px] leading-[1.4] text-muted";

/** The rows as the site orders them (projectsFromRows): by sort, then path. */
function sortedPhotos(photos: ProjectPhotosFormPhoto[]): ProjectPhotosFormPhoto[] {
  return [...photos].sort((a, b) => a.sort - b.sort || a.path.localeCompare(b.path));
}

// PLAN PR-9 „Lucrări”: one form over every photo of a project (alt text, order, delete)
// plus one new photo, for the `saveProjectPhotos` Server Action. The new photo goes to the
// bucket from the browser (PhotoField, folder `projects`, named after the project id) and
// the form posts only its path with its alt text; the submit is held while the upload runs.
// The submit goes through `onSubmit` so the typed values survive a save with errors.
// Without JavaScript the `<form action>` posts to the action.
export function ProjectPhotosForm({ projectId, photos }: ProjectPhotosFormProps) {
  const [state, formAction, pending] = useActionState(saveProjectPhotos, ADMIN_INITIAL_STATE);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const ordered = sortedPhotos(photos);

  // PhotoField keeps the path it uploaded, and the action ends with refresh(), which keeps
  // client state: left alone, the submit after a successful save would post the stored
  // photo again. Counting the saves (derived while rendering, as React documents for state
  // that follows a changed value) keys the „Adaugă o poză” block, so it remounts empty.
  const [seen, setSeen] = useState(state);
  const [saved, setSaved] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "ok") setSaved(saved + 1);
  }

  useEffect(() => {
    const form = formRef.current;
    if (state.status === "error" && state.fieldErrors && form) {
      // The focus goes to the first invalid field in form order, read from the DOM (the rows
      // as shown, then the new photo), so a re-render with the same errors moves nothing.
      const order = Array.from(form.elements, (element) => element.getAttribute("name") ?? "").filter(Boolean);
      focusFirstInvalid(form, state.fieldErrors, order);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The disabled button already blocks the submit; this covers a scripted one.
    if (uploading) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const newPhotoId = `${id}-new-photo`;
  const newAltId = `${id}-new-alt`;
  const newAltHintId = `${newAltId}-hint`;
  const held = pending || uploading;

  return (
    <AdminCard>
      <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-8">
        <input type="hidden" name="project_id" value={projectId} />

        {ordered.length === 0 ? (
          <EmptyState>{PROJECT_PHOTOS_TEXTS.empty}</EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-6 p-0">
            {ordered.map((photo) => (
              <PhotoRow key={photo.id} photo={photo} idPrefix={`${id}-${photo.id}`} errors={errors} />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-[18px] border-t border-rule pt-6">
          <h3 className="text-[16px] font-semibold">{PROJECT_PHOTOS_TEXTS.add}</h3>
          <div key={saved} className={fieldGridClasses}>
            <div className="col-span-full">
              <PhotoField
                folder="projects"
                slug={projectId}
                currentPath={null}
                label={PROJECT_PHOTOS_TEXTS.newPhoto}
                hint={PROJECT_PHOTOS_TEXTS.newPhotoHint}
                ratio="4:3"
                id={newPhotoId}
                error={errors[PHOTO_FIELDS.path]}
                onUploadingChange={setUploading}
              />
            </div>
            <Field className="col-span-full">
              <Label htmlFor={newAltId}>{PROJECT_PHOTOS_TEXTS.newAlt}</Label>
              <Input
                id={newAltId}
                name={NEW_PHOTO_ALT_FIELD}
                type="text"
                maxLength={PROJECT_LIMITS.alt}
                invalid={Boolean(errors[NEW_PHOTO_ALT_FIELD])}
                aria-describedby={newAltHintId}
              />
              <p id={newAltHintId} className={HINT}>
                {PROJECT_PHOTOS_TEXTS.newAltHint}
              </p>
              <FieldError fieldId={newAltId}>{errors[NEW_PHOTO_ALT_FIELD]}</FieldError>
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="primary" disabled={held} aria-busy={pending || undefined}>
            {pending ? PROJECT_PHOTOS_TEXTS.submitting : PROJECT_PHOTOS_TEXTS.submit}
          </Button>
          {!pending && state.status !== "idle" && (
            <Notice tone={state.status === "ok" ? "ok" : "error"} className="min-w-0 flex-1">
              {state.message}
            </Notice>
          )}
        </div>
      </form>
    </AdminCard>
  );
}

function PhotoRow({ photo, idPrefix, errors }: { photo: ProjectPhotosFormPhoto; idPrefix: string; errors: FieldErrors }) {
  const names = photoRowFields(photo.id);
  const altId = `${idPrefix}-alt`;
  const sortId = `${idPrefix}-sort`;
  const deleteId = `${idPrefix}-delete`;
  const src = mediaUrl(photo.path);

  return (
    <li className="flex flex-wrap items-start gap-4 border-b border-rule pb-6 last:border-b-0 last:pb-0">
      <input type="hidden" name={PHOTO_ROW_ID_FIELD} value={photo.id} />
      <div className="relative w-40 shrink-0 overflow-hidden border border-rule bg-card aspect-[4/3]">
        {src && (
          // A thumbnail from the public bucket, shown only to the admin; the alt text is the
          // input next to it, so the image itself is decorative here: a plain <img>, next/image's
          // optimisation and remote-pattern check bring nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={160} height={120} loading="lazy" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <div className={cx(fieldGridClasses, "min-w-0 flex-1")}>
        <Field className="col-span-full">
          <Label htmlFor={altId}>{PROJECT_PHOTOS_TEXTS.alt}</Label>
          <Input
            id={altId}
            name={names.alt}
            type="text"
            defaultValue={photo.alt}
            required
            maxLength={PROJECT_LIMITS.alt}
            invalid={Boolean(errors[names.alt])}
          />
          <FieldError fieldId={altId}>{errors[names.alt]}</FieldError>
        </Field>
        <Field>
          <Label htmlFor={sortId}>{PROJECT_PHOTOS_TEXTS.sort}</Label>
          <Input
            id={sortId}
            name={names.sort}
            type="number"
            inputMode="numeric"
            min={0}
            max={PROJECT_LIMITS.sort}
            step={1}
            defaultValue={photo.sort}
            invalid={Boolean(errors[names.sort])}
          />
          <FieldError fieldId={sortId}>{errors[names.sort]}</FieldError>
        </Field>
        <Field className="justify-end">
          <Checkbox id={deleteId} name={names.delete}>
            {PROJECT_PHOTOS_TEXTS.delete}
          </Checkbox>
        </Field>
      </div>
    </li>
  );
}
