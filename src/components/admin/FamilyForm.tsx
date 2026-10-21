"use client";

import { Fragment, startTransition, useActionState, useEffect, useId, useRef, type FormEvent } from "react";
import { saveFamily } from "@/actions/admin/save-family";
import { AdminCard, Notice, Tag, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Field, FieldError, Input, Label, Textarea, fieldErrorId } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { SPEC_ROW_NUMBERS, specFieldNames } from "@/lib/admin/catalog-schemas";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
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
  specsHint: "Rândurile goale nu apar. Pagina Materiale arată patru rânduri.",
  rowName: (row: number) => `Rând ${row}, nume`,
  rowValue: (row: number) => `Rând ${row}, valoare`,
} as const;

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = ["name", "description", "specs"];

// PLAN PR-8 „Familii”: the name, the description and the specification rows of one
// material family, in the site's card (DESIGN §4.8). `useActionState` drives the
// `saveFamily` Server Action; the submit goes through `onSubmit` so what the admin
// typed stays in place after a save. Without JavaScript the `<form action>` posts to
// the action. The code and the tab are structural and only shown.
export function FamilyForm({ family }: FamilyFormProps) {
  const [state, formAction, pending] = useActionState(saveFamily, ADMIN_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const ids = { name: `${id}-name`, description: `${id}-description`, specs: `${id}-specs`, fixed: `${id}-fixed` };
  const specsInvalid = Boolean(errors.specs);
  const specsHintId = `${ids.specs}-hint`;
  const specsDescribedBy = [specsHintId, specsInvalid ? fieldErrorId(ids.specs) : undefined].filter(Boolean).join(" ");

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-6">
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
            <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2 pt-[6px]">
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
                      aria-invalid={specsInvalid || undefined}
                      aria-describedby={specsDescribedBy}
                      data-field={row === 1 ? "specs" : undefined}
                    />
                    <Input
                      name={names.v}
                      aria-label={FAMILY_TEXTS.rowValue(row)}
                      defaultValue={spec?.v ?? ""}
                      maxLength={80}
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
        <SaveNotice state={state} pending={pending} />
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

function SaveNotice({ state, pending }: { state: AdminActionState; pending: boolean }) {
  if (pending || state.status === "idle") return null;
  return (
    <Notice tone={state.status === "ok" ? "ok" : "error"} className="min-w-0 flex-1">
      {state.message}
    </Notice>
  );
}
