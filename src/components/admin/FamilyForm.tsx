"use client";

import { Fragment, startTransition, useEffect, useId, useLayoutEffect, useRef, type FormEvent } from "react";
import { saveFamily } from "@/actions/admin/save-family";
import { AdminCard, Notice, Tag, fieldGridClasses } from "@/components/admin/ui";
import { useSavedNotice } from "@/components/admin/useSavedNotice";
import { Button } from "@/components/site/Button";
import { Field, FieldError, Input, Label, Textarea, fieldErrorId } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { useGuardedActionState } from "@/components/site/form/useGuardedActionState";
import { SPEC_ROW_NUMBERS, specFieldNames } from "@/lib/admin/catalog-schemas";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";

export interface FamilyFormProps {
  /** The `material_families` row as the page read it, with `specs` already decoded (specsFromJson). */
  family: {
    id: string;
    name: string;
    code: string;
    tab: string;
    description: string | null;
    specs: { k: string; v: string }[];
  };
}

export const FAMILY_TEXTS = {
  fixedHint: "Codul și tab-ul sunt fixe: intră în codurile de configurare și în regulile paginii Materiale.",
  descriptionHint: "Paragraful de pe pagina Materiale.",
  specsLegend: "Specificații",
  specsHint: "Rândurile goale nu apar. Pagina Materiale arată toate rândurile completate, în ordinea de aici.",
  rowName: (row: number) => `Rând ${row}, nume`,
  rowValue: (row: number) => `Rând ${row}, valoare`,
} as const;

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = ["name", "description", "specs"];

/** The names of the grid's boxes: `spec_k_1`, `spec_v_1` … */
const SPEC_BOX_NAMES: ReadonlySet<string> = new Set(SPEC_ROW_NUMBERS.flatMap((row) => Object.values(specFieldNames(row))));

/** The state of a call that brought no answer (a dropped connection, a deployment made meanwhile): useGuardedActionState. */
const CALL_FAILED: AdminActionState = { status: "error", message: ADMIN_MESSAGES.generic };

// PLAN PR-8 „Familii”: the name, the description and the specification rows of one
// material family, in the site's card (DESIGN §4.8). `useGuardedActionState` drives the
// `saveFamily` Server Action (a call that fails leaves the form as it is, with
// CALL_FAILED beside the button); the submit goes through `onSubmit` so what the admin
// typed stays in place after a save (React resets a form it submitted itself). The
// specification grid is the one part that follows the database instead: see `specsKey`.
// Without JavaScript the `<form action>` posts to the action. The code and the tab are
// structural and only shown.
export function FamilyForm({ family }: FamilyFormProps) {
  const [state, formAction, pending, submit] = useGuardedActionState(saveFamily, ADMIN_INITIAL_STATE, CALL_FAILED);
  const [edited, markEdited] = useSavedNotice(pending);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const ids = { name: `${id}-name`, description: `${id}-description`, specs: `${id}-specs`, fixed: `${id}-fixed` };
  const specsInvalid = Boolean(errors.specs);
  const specsHintId = `${ids.specs}-hint`;
  const specsDescribedBy = [specsHintId, specsInvalid ? fieldErrorId(ids.specs) : undefined].filter(Boolean).join(" ");
  // The server drops the empty rows, so a save that left a gap stores the rows in other
  // positions than the boxes they were typed in, and the page hands the stored rows back
  // with the action's answer. The boxes are uncontrolled: one that was typed in never
  // follows its new default, so the grid would show a row twice or leave one out, and the
  // next save would store what it shows. Keyed on the stored rows, the grid is rebuilt
  // from them whenever a save changes them, and left alone, typed text included, when it
  // does not (a refused save, a save of the name or the description). A rebuild throws
  // away whatever its boxes hold, so they are read-only while a save runs: a row typed
  // then was not in the submit and would be gone, without a word, when the answer came.
  const specsKey = JSON.stringify(family.specs);
  // The name of the grid box the last submit was sent from (Enter in it); null for any other submit.
  const submittedFrom = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
  }, [state]);

  // A rebuild replaces the box a save was sent from with Enter, and the focus falls to the
  // page: the next keystroke would go nowhere. It is put back in the box of the same name,
  // unless something else has taken it meanwhile. A layout effect, so that it happens in
  // the same commit as the rebuild, before a keystroke can land on the page.
  useLayoutEffect(() => {
    const name = submittedFrom.current;
    submittedFrom.current = null;
    if (!name || document.activeElement !== document.body) return;
    const box = formRef.current?.elements.namedItem(name);
    if (box instanceof HTMLElement) box.focus();
  }, [specsKey]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const active = document.activeElement;
    const inGrid = active instanceof HTMLInputElement && active.form === event.currentTarget && SPEC_BOX_NAMES.has(active.name);
    submittedFrom.current = inGrid ? active.name : null;
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} onChange={markEdited} noValidate autoComplete="off" className="flex flex-col gap-6">
      <input type="hidden" name="id" value={family.id} />
      <AdminCard>
        <div className={fieldGridClasses}>
          <Field>
            <Label htmlFor={ids.name}>Nume</Label>
            <Input id={ids.name} name="name" defaultValue={family.name} maxLength={80} invalid={Boolean(errors.name)} />
            <FieldError fieldId={ids.name}>{errors.name}</FieldError>
          </Field>

          <Field>
            <span className="text-[14px] leading-[1.4] font-semibold text-ink">Cod și tab</span>
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{family.code}</Tag>
              <Tag tone="muted">{family.tab}</Tag>
            </div>
            <Hint id={ids.fixed}>{FAMILY_TEXTS.fixedHint}</Hint>
          </Field>

          <Field className="col-span-full">
            <Label htmlFor={ids.description}>Descriere</Label>
            <Textarea
              id={ids.description}
              name="description"
              rows={3}
              defaultValue={family.description ?? ""}
              maxLength={1000}
              invalid={Boolean(errors.description)}
              aria-describedby={`${ids.description}-hint`}
            />
            <Hint id={`${ids.description}-hint`}>{FAMILY_TEXTS.descriptionHint}</Hint>
            <FieldError fieldId={ids.description}>{errors.description}</FieldError>
          </Field>

          <fieldset className="col-span-full flex min-w-0 flex-col gap-[6px]">
            <legend className="text-[14px] leading-[1.4] font-semibold text-ink">{FAMILY_TEXTS.specsLegend}</legend>
            <div key={specsKey} className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2 pt-[6px]">
              {/* The column heads are decoration: every input carries its own „Rând n, …” label. */}
              <span aria-hidden="true" />
              <span aria-hidden="true" className="eyebrow">
                Nume
              </span>
              <span aria-hidden="true" className="eyebrow">
                Valoare
              </span>
              {SPEC_ROW_NUMBERS.map((row) => {
                const names = specFieldNames(row);
                const spec = family.specs[row - 1];
                return (
                  <Fragment key={row}>
                    <span aria-hidden="true" className="mono-13 text-muted">
                      {row}
                    </span>
                    <Input
                      name={names.k}
                      aria-label={FAMILY_TEXTS.rowName(row)}
                      defaultValue={spec?.k ?? ""}
                      maxLength={80}
                      readOnly={pending}
                      aria-invalid={specsInvalid || undefined}
                      aria-describedby={specsDescribedBy}
                      data-field={row === 1 ? "specs" : undefined}
                    />
                    <Input
                      name={names.v}
                      aria-label={FAMILY_TEXTS.rowValue(row)}
                      defaultValue={spec?.v ?? ""}
                      maxLength={80}
                      readOnly={pending}
                      aria-invalid={specsInvalid || undefined}
                      aria-describedby={specsDescribedBy}
                    />
                  </Fragment>
                );
              })}
            </div>
            <Hint id={specsHintId}>{FAMILY_TEXTS.specsHint}</Hint>
            <FieldError fieldId={ids.specs}>{errors.specs}</FieldError>
          </fieldset>
        </div>
      </AdminCard>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Se salvează…" : "Salvează"}
        </Button>
        <SaveNotice state={state} pending={pending} edited={edited} />
      </div>
    </form>
  );
}

function Hint({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-[14px] leading-[1.4] text-muted">
      {children}
    </p>
  );
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
