"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { saveBase } from "@/actions/admin/save-base";
import { PhotoField } from "@/components/admin/PhotoField";
import { AdminCard, Notice, Tag, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";

export interface BaseFormProps {
  /** The `bases` row as the page read it (inactive rows included). */
  base: { id: string; name: string; note: string; code: string; photo_path: string | null; active: boolean; sort: number };
}

export const BASE_TEXTS = {
  noteHint: "Apare sub nume în configurator și pe Materiale.",
  photoLabel: "Poză (4:3)",
  photoHint: "Piciorul sau baza, fotografiate pe fundal neutru.",
  active: "Activ (apare pe site și în configurator)",
} as const;

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = ["name", "note", PHOTO_FIELDS.path, "active", "sort"];

// PLAN PR-8 „Baze”: the name, the note, the photo (4:3) and `active` of one base, in
// the site's card (DESIGN §4.8). `useActionState` drives the `saveBase` Server Action;
// the submit goes through `onSubmit` so what the admin typed stays in place after a
// save, and it waits while PhotoField is still uploading (the path would be stale).
// Without JavaScript the `<form action>` posts to the action, keeping the photo it had.
export function BaseForm({ base }: BaseFormProps) {
  const [state, formAction, pending] = useActionState(saveBase, ADMIN_INITIAL_STATE);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const ids = { name: `${id}-name`, note: `${id}-note`, photo: `${id}-photo`, active: `${id}-active`, sort: `${id}-sort` };

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The disabled button already blocks the submit; this covers a scripted one.
    if (uploading) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-6">
      <input type="hidden" name="id" value={base.id} />
      <AdminCard>
        <div className={fieldGridClasses}>
          <Field>
            <Label htmlFor={ids.name}>Nume</Label>
            <Input id={ids.name} name="name" defaultValue={base.name} maxLength={80} invalid={Boolean(errors.name)} />
            <FieldError fieldId={ids.name}>{errors.name}</FieldError>
          </Field>

          <Field>
            <Label htmlFor={ids.note}>Notă</Label>
            <Input
              id={ids.note}
              name="note"
              defaultValue={base.note}
              maxLength={120}
              invalid={Boolean(errors.note)}
              aria-describedby={`${ids.note}-hint`}
            />
            <p id={`${ids.note}-hint`} className="text-[14px] leading-[1.4] text-muted">
              {BASE_TEXTS.noteHint}
            </p>
            <FieldError fieldId={ids.note}>{errors.note}</FieldError>
          </Field>

          <Field className="col-span-full">
            <span className="text-[14px] leading-[1.4] font-semibold text-ink">Cod</span>
            <div>
              <Tag>{base.code}</Tag>
            </div>
          </Field>

          <div className="col-span-full">
            <PhotoField
              folder="bases"
              slug={base.id}
              currentPath={base.photo_path}
              label={BASE_TEXTS.photoLabel}
              hint={BASE_TEXTS.photoHint}
              ratio="4:3"
              id={ids.photo}
              error={errors[PHOTO_FIELDS.path]}
              onUploadingChange={setUploading}
            />
          </div>

          <Field className="col-span-full">
            <Checkbox id={ids.active} name="active" defaultChecked={base.active} invalid={Boolean(errors.active)}>
              {BASE_TEXTS.active}
            </Checkbox>
            <FieldError fieldId={ids.active}>{errors.active}</FieldError>
          </Field>

          <Field>
            <Label htmlFor={ids.sort}>Ordine</Label>
            <Input
              id={ids.sort}
              name="sort"
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              step={1}
              defaultValue={base.sort}
              invalid={Boolean(errors.sort)}
            />
            <FieldError fieldId={ids.sort}>{errors.sort}</FieldError>
          </Field>
        </div>
      </AdminCard>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" disabled={pending || uploading} aria-busy={pending || undefined}>
          {pending ? "Se salvează…" : "Salvează"}
        </Button>
        <SaveNotice state={state} pending={pending} />
      </div>
    </form>
  );
}

function SaveNotice({ state, pending }: { state: AdminActionState; pending: boolean }) {
  if (pending || state.status === "idle") return null;
  return (
    <Notice tone={state.status === "ok" ? "ok" : "error"} className="min-w-0 flex-1">
      {state.message}
    </Notice>
  );
}
