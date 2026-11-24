"use client";

import { startTransition, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { saveSettings } from "@/actions/admin/save-settings";
import { PhotoField } from "@/components/admin/PhotoField";
import { AdminCard, AdminSection, Notice, fieldGridClasses } from "@/components/admin/ui";
import { useSavedNotice } from "@/components/admin/useSavedNotice";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label, Textarea } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { useGuardedActionState } from "@/components/site/form/useGuardedActionState";
import { photoFieldNames } from "@/lib/admin/media";
import { SETTINGS_FIELDS, SETTINGS_FINGERPRINT_FIELD, SETTINGS_GROUPS, type SettingsField } from "@/lib/admin/settings-fields";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";
import type { Settings } from "@/lib/data/settings.seed";

export interface SettingsFormProps {
  /**
   * The current row merged over the seed (settingsFromData). The boxes are filled from the one
   * the form is first rendered with and from no later one; only the photo field follows it.
   */
  settings: Settings;
  /**
   * The fingerprint of the stored row `settings` was read from (settingsFingerprint); "" when
   * the page could not read it. The form posts it back, and saveSettings writes nothing when
   * the stored row is no longer that one (someone else saved while this page was open), unless
   * the row already holds the very values the post carries.
   */
  fingerprint: string;
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

/**
 * The state of a call that brought no answer (a dropped connection, a deployment made meanwhile):
 * useGuardedActionState. Not `generic`, which the server answers when a write failed: here the
 * save may have gone through, and after a deployment a retry from this page cannot reach the action.
 */
const CALL_FAILED: AdminActionState = { status: "error", message: ADMIN_MESSAGES.noAnswer };

// DESIGN §4.8 „Formulare”: one form over every Settings key, grouped as the seed
// groups them. `useGuardedActionState` drives the Server Action: a call that fails
// leaves the form as it is, with CALL_FAILED in the bar. The inputs are uncontrolled
// and the submit goes through `onSubmit`, not the form's `action` path, because React
// resets a form it submitted itself once the action settles: here what the admin
// typed stays in place after a save. Without JavaScript the `<form action>` posts to
// the action. No client pre-pass: the admin reads the server's field errors. The
// submit is held while the workshop photo (PR-9, a PhotoField) is still uploading.
// A hidden input posts the fingerprint of the stored row the fields stand on
// (useRowFingerprint): saveSettings refuses the save of a copy that has gone stale.
//
// The page is rendered again under an open form, and the form takes its boxes and its
// fingerprint from the first render only. So the form itself decides when to start over,
// here, where its history is known: one first rendered without the row (locked, the seed
// in its boxes, an empty fingerprint no save gets past) is replaced by a new one as soon
// as the row is read. A form that was filled from the row is never replaced: when a later
// read fails it stays, with what was typed in it, holds the save for that render and
// saves after the next good read.
export function SettingsForm(props: SettingsFormProps) {
  const locked = props.locked ?? false;
  // Derived while rendering, as React documents for state that follows a changed prop.
  const [form, setForm] = useState({ generation: 0, filledFromSeed: locked });
  if (form.filledFromSeed && !locked) setForm({ generation: form.generation + 1, filledFromSeed: false });
  return <SettingsFormFields key={form.generation} {...props} />;
}

function SettingsFormFields({ settings, fingerprint, locked = false }: SettingsFormProps) {
  const [state, formAction, pending, submit] = useGuardedActionState(saveSettings, ADMIN_INITIAL_STATE, CALL_FAILED);
  const rowFingerprint = useRowFingerprint(fingerprint, state);
  // The row the boxes are filled from: the one of the first render, like the fingerprint above.
  // The page is rendered again under the open form, and its row may then be a newer one. React
  // writes a changed default into a box nobody typed in (an empty one always, any single-line one
  // on a page loaded by its address), so the boxes would show that row's values, unannounced,
  // while the form went on posting the older fingerprint.
  const [filled] = useState(settings);
  const [edited, markEdited] = useSavedNotice(pending);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const held = pending || locked || uploading;

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The disabled button already blocks the submit; this covers a scripted one.
    if (locked || uploading) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      onChange={markEdited}
      noValidate
      autoComplete="off"
      className="flex flex-col gap-8"
    >
      <input type="hidden" name={SETTINGS_FINGERPRINT_FIELD} value={rowFingerprint} />
      {SETTINGS_GROUPS.map((group) => (
        <AdminSection key={group.title} title={group.title}>
          <AdminCard>
            <div className={fieldGridClasses}>
              {group.fields.map((field) => (
                <SettingsControl
                  key={field.key}
                  field={field}
                  id={`${id}-${field.key}`}
                  // The photo field alone follows the page: the path it posts as `_before` has to
                  // be the one on the row after this form's own save, which the action's answer
                  // brings in a new render of the page.
                  value={(field.kind === "photo" ? settings : filled)[field.key]}
                  error={errors[field.key]}
                  locked={locked}
                  onUploadingChange={setUploading}
                  onPhotoRemove={markEdited}
                />
              ))}
            </div>
          </AdminCard>
        </AdminSection>
      ))}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-4 border-t border-rule bg-paper py-4">
        <Button type="submit" variant="primary" disabled={held} aria-busy={pending || undefined}>
          {pending ? "Se salvează…" : "Salvează"}
        </Button>
        {locked ? (
          <Notice tone="error" className="min-w-0 flex-1">
            {LOCKED}
          </Notice>
        ) : (
          <SaveNotice state={state} pending={pending} edited={edited} />
        )}
      </div>
    </form>
  );
}

/**
 * The fingerprint the next save posts: that of the stored row the fields stand on. First the
 * row the page loaded, then the row each save from this form left (its answer carries the
 * fingerprint); without that step a second save from the same page would be refused as a
 * stale copy. A refused save wrote nothing, so it leaves the fingerprint as it is. A call that
 * brought no answer leaves it too, but that call may have written: the form cannot know what
 * the row holds then. saveSettings takes the retry of the same values all the same (the row
 * already holds them) and its answer brings the fingerprint to follow; a retry that carries
 * anything typed since is refused as a stale copy, and only a reload gets past that.
 *
 * `loaded` counts on the first render only, like the row the boxes are filled from (`filled`
 * in SettingsForm). The page is rendered again under an open form, with the answer of a save
 * and when the admin returns to a screen the router kept, and its row may then be one someone
 * else saved meanwhile, while the boxes hold the older row and what was typed: posting the
 * newer row's fingerprint would let this copy write its old values over it. (A form first
 * rendered without a row is not kept at all: SettingsForm replaces it once the row is read.) The
 * answer the form starts with is not followed either: there is one only on a page rendered
 * whole as the answer to a post made without JavaScript, and its fields and `loaded` come
 * from a read made after that save.
 */
function useRowFingerprint(loaded: string, answer: AdminActionState): string {
  // Derived while rendering, as React documents for state that follows a changed value
  // (useSavedNotice does the same).
  const [row, setRow] = useState({ fingerprint: loaded, answer });
  if (answer !== row.answer) {
    const saved = answer.status === "ok" ? answer.fingerprint : undefined;
    setRow({ fingerprint: saved ?? row.fingerprint, answer });
  }
  return row.fingerprint;
}

function SaveNotice({ state, pending, edited }: { state: AdminActionState; pending: boolean; edited: boolean }) {
  // „Salvat.” speaks only for what the submit carried: an edit since then hides it (useSavedNotice).
  if (pending || state.status === "idle" || (state.status === "ok" && edited)) return null;
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
  /** The page could not read the saved row: the photo field must not upload what can never be saved. */
  locked?: boolean;
  /** From the photo field: the form holds its submit while an upload runs. */
  onUploadingChange: (uploading: boolean) => void;
  /** From the photo field: „Șterge poza” is a click, so the form hears of it here, not through its `onChange`. */
  onPhotoRemove: () => void;
}

function SettingsControl({ field, id, value, error, onUploadingChange, onPhotoRemove, locked = false }: SettingsControlProps) {
  const invalid = Boolean(error);
  const hintId = field.hint ? `${id}-hint` : undefined;
  const hint = field.hint && (
    <p id={hintId} className="text-[14px] leading-[1.4] text-muted">
      {field.hint}
    </p>
  );

  if (field.kind === "photo") {
    // FOTO 08 (PLAN PR-9): the browser uploads the photo to the `site/` folder of the
    // media bucket and the field posts its path under the key's name, plus the path it
    // loaded with (`…_before`), which the action removes once the row is saved. The
    // preview box is 4:3; the site shows the photo at 4:5 (the hint says so).
    return (
      <div className="col-span-full">
        <PhotoField
          folder="site"
          slug="atelier"
          currentPath={typeof value === "string" && value !== "" ? value : null}
          label={field.label}
          hint={field.hint}
          ratio="4:3"
          id={id}
          error={error}
          names={photoFieldNames(field.key)}
          disabled={locked}
          onUploadingChange={onUploadingChange}
          onRemove={onPhotoRemove}
        />
      </div>
    );
  }

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
