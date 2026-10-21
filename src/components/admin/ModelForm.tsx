"use client";

import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent } from "react";
import { saveModel } from "@/actions/admin/save-model";
import { AdminCard, Notice, Tag, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label, Textarea, fieldErrorId } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";

export interface ModelFormProps {
  /** The `models` row as the page read it (inactive rows included). */
  model: { id: string; name: string; note: string; code: string; description: string | null; active: boolean; sort: number };
  /** Every material family, in `sort` order: one checkbox each. */
  families: { id: string; name: string; code: string }[];
  /** The family ids the model allows today (`model_families`). */
  selected: string[];
}

export const MODEL_TEXTS = {
  noteHint: "Apare sub nume pe cardul modelului, de exemplu „Tapițat, cu nasturi”.",
  descriptionHint: "Textul cardului de pe Acasă.",
  familiesLegend: "Familii de materiale permise",
  familiesHint: "Clientul alege doar dintre aceste familii pentru acest model.",
  active: "Activ (apare pe site și în configurator)",
} as const;

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = ["name", "note", "description", "families", "active", "sort"];

// PLAN PR-8 „Modele”: the texts, the model ↔ family rules and `active` of one model,
// in the site's card (DESIGN §4.8). `useActionState` drives the `saveModel` Server
// Action; the submit goes through `onSubmit` so what the admin typed stays in place
// after a save (React resets a form it submitted itself). Without JavaScript the
// `<form action>` posts to the action. The code is shown, never edited: it is part
// of every configuration code.
export function ModelForm({ model, families, selected }: ModelFormProps) {
  const [state, formAction, pending] = useActionState(saveModel, ADMIN_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const ids = {
    name: `${id}-name`,
    note: `${id}-note`,
    description: `${id}-description`,
    families: `${id}-families`,
    active: `${id}-active`,
    sort: `${id}-sort`,
  };
  const familiesInvalid = Boolean(errors.families);
  const familiesHintId = `${ids.families}-hint`;
  const familiesDescribedBy = [familiesHintId, familiesInvalid ? fieldErrorId(ids.families) : undefined]
    .filter(Boolean)
    .join(" ");
  const chosen = new Set(selected);

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
      <input type="hidden" name="id" value={model.id} />
      <AdminCard>
        <div className={fieldGridClasses}>
          <Field>
            <Label htmlFor={ids.name}>Nume</Label>
            <Input id={ids.name} name="name" defaultValue={model.name} maxLength={80} invalid={Boolean(errors.name)} />
            <FieldError fieldId={ids.name}>{errors.name}</FieldError>
          </Field>

          <Field>
            <Label htmlFor={ids.note}>Notă scurtă</Label>
            <Input
              id={ids.note}
              name="note"
              defaultValue={model.note}
              maxLength={120}
              invalid={Boolean(errors.note)}
              aria-describedby={`${ids.note}-hint`}
            />
            <Hint id={`${ids.note}-hint`}>{MODEL_TEXTS.noteHint}</Hint>
            <FieldError fieldId={ids.note}>{errors.note}</FieldError>
          </Field>

          <Field className="col-span-full">
            <Label htmlFor={ids.description}>Descriere</Label>
            <Textarea
              id={ids.description}
              name="description"
              rows={4}
              defaultValue={model.description ?? ""}
              maxLength={1000}
              invalid={Boolean(errors.description)}
              aria-describedby={`${ids.description}-hint`}
            />
            <Hint id={`${ids.description}-hint`}>{MODEL_TEXTS.descriptionHint}</Hint>
            <FieldError fieldId={ids.description}>{errors.description}</FieldError>
          </Field>

          <Field className="col-span-full">
            <span className="text-[14px] leading-[1.4] font-semibold text-ink">Cod</span>
            <div>
              <Tag>{model.code}</Tag>
            </div>
          </Field>

          <fieldset className="col-span-full flex min-w-0 flex-col gap-[6px]">
            <legend className="text-[14px] leading-[1.4] font-semibold text-ink">{MODEL_TEXTS.familiesLegend}</legend>
            <div className="flex flex-col pt-[6px]">
              {families.map((family, index) => (
                <Checkbox
                  key={family.id}
                  id={`${ids.families}-${family.id}`}
                  name="families"
                  value={family.id}
                  defaultChecked={chosen.has(family.id)}
                  aria-invalid={familiesInvalid || undefined}
                  aria-describedby={familiesDescribedBy}
                  // focusFirstInvalid finds the group through the first box (the name is shared).
                  data-field={index === 0 ? "families" : undefined}
                >
                  {family.name}{" "}
                  <Tag tone="muted" className="ml-1">
                    {family.code}
                  </Tag>
                </Checkbox>
              ))}
            </div>
            <Hint id={familiesHintId}>{MODEL_TEXTS.familiesHint}</Hint>
            <FieldError fieldId={ids.families}>{errors.families}</FieldError>
          </fieldset>

          <Field className="col-span-full">
            <Checkbox id={ids.active} name="active" defaultChecked={model.active} invalid={Boolean(errors.active)}>
              {MODEL_TEXTS.active}
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
              defaultValue={model.sort}
              invalid={Boolean(errors.sort)}
            />
            <FieldError fieldId={ids.sort}>{errors.sort}</FieldError>
          </Field>
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
