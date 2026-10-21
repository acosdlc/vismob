"use client";

import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent } from "react";
import { saveSettings } from "@/actions/admin/save-settings";
import { AdminCard, AdminSection, Notice, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label, Textarea } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { SETTINGS_FIELDS, SETTINGS_GROUPS, type SettingsField } from "@/lib/admin/settings-fields";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";
import type { Settings } from "@/lib/data/settings.seed";

export interface SettingsFormProps {
  /** The current row merged over the seed (settingsFromData); the fields start from it. */
  settings: Settings;
  /**
   * True when the page could not read the saved row and the fields show the seed: a save
   * would then put the placeholders on the site, so „Salvează” is disabled and the bar
   * tells the admin to reload the page first. The fields stay visible.
   */
  locked?: boolean;
}

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = SETTINGS_FIELDS.map((field) => field.key);

/** Textareas for a paragraph get a row more than the short ones. */
const LONG_TEXTAREAS: ReadonlySet<string> = new Set(["story_text", "delivery_note", "mattresses_note"]);

/** Shown in the bar instead of the save notice while the form is locked. */
const LOCKED = "Salvarea este oprită: formularul nu arată valorile salvate. Reîncarcă pagina înainte de a modifica ceva.";

// DESIGN §4.8 „Formulare”: one form over every Settings key, grouped as the seed
// groups them. `useActionState` drives the Server Action. The inputs are uncontrolled
// and the submit goes through `onSubmit`, not the form's `action` path, because React
// resets a form it submitted itself once the action settles: here what the admin
// typed stays in place after a save. Without JavaScript the `<form action>` posts to
// the action. No client pre-pass: the admin reads the server's field errors.
export function SettingsForm({ settings, locked = false }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(saveSettings, ADMIN_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The disabled button already blocks the submit; this covers a scripted one.
    if (locked) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      autoComplete="off"
      className="flex flex-col gap-8"
    >
      {SETTINGS_GROUPS.map((group) => (
        <AdminSection key={group.title} title={group.title}>
          <AdminCard>
            <div className={fieldGridClasses}>
              {group.fields.map((field) => (
                <SettingsControl
                  key={field.key}
                  field={field}
                  id={`${id}-${field.key}`}
                  value={settings[field.key]}
                  error={errors[field.key]}
                />
              ))}
            </div>
          </AdminCard>
        </AdminSection>
      ))}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-4 border-t border-rule bg-paper py-4">
        <Button type="submit" variant="primary" disabled={pending || locked} aria-busy={pending || undefined}>
          {pending ? "Se salvează…" : "Salvează"}
        </Button>
        {locked ? (
          <Notice tone="error" className="min-w-0 flex-1">
            {LOCKED}
          </Notice>
        ) : (
          <SaveNotice state={state} pending={pending} />
        )}
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

interface SettingsControlProps {
  field: SettingsField;
  id: string;
  value: string | boolean;
  error?: string;
}

function SettingsControl({ field, id, value, error }: SettingsControlProps) {
  const invalid = Boolean(error);
  const hintId = field.hint ? `${id}-hint` : undefined;
  const hint = field.hint && (
    <p id={hintId} className="text-[14px] leading-[1.4] text-muted">
      {field.hint}
    </p>
  );

  if (field.kind === "boolean") {
    return (
      <Field className="col-span-full">
        <Checkbox id={id} name={field.key} defaultChecked={value === true} invalid={invalid} aria-describedby={hintId}>
          {field.label}
        </Checkbox>
        {hint}
        <FieldError fieldId={id}>{error}</FieldError>
      </Field>
    );
  }

  const text = typeof value === "string" ? value : "";

  if (field.kind === "textarea") {
    return (
      <Field className="col-span-full">
        <Label htmlFor={id}>{field.label}</Label>
        <Textarea
          id={id}
          name={field.key}
          defaultValue={text}
          rows={LONG_TEXTAREAS.has(field.key) ? 4 : 3}
          maxLength={field.maxLength}
          invalid={invalid}
          aria-describedby={hintId}
        />
        {hint}
        <FieldError fieldId={id}>{error}</FieldError>
      </Field>
    );
  }

  return (
    <Field>
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        name={field.key}
        type={field.kind === "url" ? "url" : "text"}
        inputMode={field.kind === "digits" ? "numeric" : undefined}
        defaultValue={text}
        maxLength={field.maxLength}
        invalid={invalid}
        aria-describedby={hintId}
      />
      {hint}
      <FieldError fieldId={id}>{error}</FieldError>
    </Field>
  );
}
