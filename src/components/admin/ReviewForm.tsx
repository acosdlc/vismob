"use client";

import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent } from "react";
import { saveReview } from "@/actions/admin/save-review";
import { DeleteReviewButton } from "@/components/admin/DeleteReviewButton";
import { AdminCard, Notice, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label, Select, Textarea } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { REVIEW_SOURCES, reviewLabel } from "@/lib/admin/reviews";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";
import type { Tables } from "@/lib/supabase/database.types";

/** The row the form edits; null for a new review. */
export type ReviewFormReview = Pick<
  Tables<"reviews">,
  "id" | "first_name" | "city" | "body" | "model_label" | "source" | "consent" | "published" | "sort"
>;

export interface ReviewFormProps {
  review: ReviewFormReview | null;
}

export const REVIEW_FORM_TEXTS = {
  firstName: "Prenume",
  firstNameHint: "Doar prenumele, așa cum apare pe card: „Ana, Cluj”.",
  city: "Oraș",
  body: "Recenzia",
  bodyHint: "Textul exact al clientului, fără modificări.",
  modelLabel: "Model",
  modelLabelHint: "De exemplu „Capitonat · 160 × 200”.",
  source: "Sursă",
  sourceNone: "—",
  consent: "Clientul a fost de acord, în scris, cu publicarea recenziei (obligatoriu pentru publicare)",
  published: "Publicată (apare pe Acasă)",
  sort: "Ordine",
  submit: "Salvează",
  submitting: "Se salvează…",
} as const;

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = ["first_name", "city", "body", "model_label", "source", "consent", "published", "sort"];

const HINT = "text-[14px] leading-[1.4] text-muted";

// PLAN PR-9 „Recenzii”, DESIGN §4.8: one card over every editable column of a review.
// `useActionState` drives the `saveReview` Server Action; the submit goes through
// `onSubmit` so the typed values stay in place after a save (React resets a form it
// submitted itself). A new review posts an empty hidden `id` and lands on its own
// screen (the action redirects). Without JavaScript the `<form action>` posts to the
// action. No client pre-pass: the admin reads the server's field errors, the consent
// rule included (it lands on the „Publicată” checkbox).
export function ReviewForm({ review }: ReviewFormProps) {
  const [state, formAction, pending] = useActionState(saveReview, ADMIN_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const editing = review !== null;

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

  const firstNameId = `${id}-first-name`;
  const firstNameHintId = `${id}-first-name-hint`;
  const cityId = `${id}-city`;
  const bodyId = `${id}-body`;
  const bodyHintId = `${id}-body-hint`;
  const modelLabelId = `${id}-model-label`;
  const modelLabelHintId = `${id}-model-label-hint`;
  const sourceId = `${id}-source`;
  const consentId = `${id}-consent`;
  const publishedId = `${id}-published`;
  const sortId = `${id}-sort`;

  return (
    <div className="flex flex-col gap-8">
      <AdminCard>
        <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-6">
          <input type="hidden" name="id" value={review?.id ?? ""} />

          <div className={fieldGridClasses}>
            <Field>
              <Label htmlFor={firstNameId}>{REVIEW_FORM_TEXTS.firstName}</Label>
              <Input
                id={firstNameId}
                name="first_name"
                type="text"
                defaultValue={review?.first_name ?? ""}
                maxLength={60}
                invalid={Boolean(errors.first_name)}
                aria-describedby={firstNameHintId}
              />
              <p id={firstNameHintId} className={HINT}>
                {REVIEW_FORM_TEXTS.firstNameHint}
              </p>
              <FieldError fieldId={firstNameId}>{errors.first_name}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={cityId}>{REVIEW_FORM_TEXTS.city}</Label>
              <Input id={cityId} name="city" type="text" defaultValue={review?.city ?? ""} maxLength={80} invalid={Boolean(errors.city)} />
              <FieldError fieldId={cityId}>{errors.city}</FieldError>
            </Field>

            <Field className="col-span-full">
              <Label htmlFor={bodyId}>{REVIEW_FORM_TEXTS.body}</Label>
              <Textarea
                id={bodyId}
                name="body"
                rows={5}
                defaultValue={review?.body ?? ""}
                maxLength={1000}
                invalid={Boolean(errors.body)}
                aria-describedby={bodyHintId}
              />
              <p id={bodyHintId} className={HINT}>
                {REVIEW_FORM_TEXTS.bodyHint}
              </p>
              <FieldError fieldId={bodyId}>{errors.body}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={modelLabelId}>{REVIEW_FORM_TEXTS.modelLabel}</Label>
              <Input
                id={modelLabelId}
                name="model_label"
                type="text"
                defaultValue={review?.model_label ?? ""}
                maxLength={80}
                invalid={Boolean(errors.model_label)}
                aria-describedby={modelLabelHintId}
              />
              <p id={modelLabelHintId} className={HINT}>
                {REVIEW_FORM_TEXTS.modelLabelHint}
              </p>
              <FieldError fieldId={modelLabelId}>{errors.model_label}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={sourceId}>{REVIEW_FORM_TEXTS.source}</Label>
              <Select id={sourceId} name="source" defaultValue={review?.source ?? ""} invalid={Boolean(errors.source)}>
                <option value="">{REVIEW_FORM_TEXTS.sourceNone}</option>
                {REVIEW_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
                {/* A value written by SQL that the select does not offer stays visible (and is refused on save) rather than silently becoming „—”. */}
                {review?.source && !REVIEW_SOURCES.some((source) => source.value === review.source) && (
                  <option value={review.source}>{review.source}</option>
                )}
              </Select>
              <FieldError fieldId={sourceId}>{errors.source}</FieldError>
            </Field>

            <Field className="col-span-full">
              <Checkbox id={consentId} name="consent" defaultChecked={review?.consent ?? false} invalid={Boolean(errors.consent)}>
                {REVIEW_FORM_TEXTS.consent}
              </Checkbox>
              <FieldError fieldId={consentId}>{errors.consent}</FieldError>
            </Field>

            <Field className="col-span-full">
              <Checkbox id={publishedId} name="published" defaultChecked={review?.published ?? false} invalid={Boolean(errors.published)}>
                {REVIEW_FORM_TEXTS.published}
              </Checkbox>
              <FieldError fieldId={publishedId}>{errors.published}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={sortId}>{REVIEW_FORM_TEXTS.sort}</Label>
              <Input
                id={sortId}
                name="sort"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                step={1}
                defaultValue={review?.sort ?? 0}
                invalid={Boolean(errors.sort)}
              />
              <FieldError fieldId={sortId}>{errors.sort}</FieldError>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
              {pending ? REVIEW_FORM_TEXTS.submitting : REVIEW_FORM_TEXTS.submit}
            </Button>
            <SaveNotice state={state} pending={pending} />
          </div>
        </form>
      </AdminCard>

      {editing && <DeleteReviewButton id={review.id} name={reviewLabel(review)} />}
    </div>
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
