"use client";

import { startTransition, useActionState, useId, type FormEvent } from "react";
import { updateLead } from "@/actions/admin/update-lead";
import { AdminCard, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Field, FieldError, Label, Select, Textarea, formStackClasses } from "@/components/site/form";
import { ADMIN_INITIAL_STATE, LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/admin/types";

export interface LeadStatusFormProps {
  leadId: string;
  status: LeadStatus;
  notes: string | null;
}

export const NOTES_MAX = 4000;
export const NOTES_HINT = "Doar pentru atelier; clientul nu le vede.";

// PLAN PR-7 „Cereri”: the status select (nou … spam) and the internal notes of one
// request, in the site's card (DESIGN §4.8). `useActionState` drives the `updateLead`
// Server Action; the submit goes through `onSubmit` so the chosen status and the typed
// notes stay in place after a save (React resets a form it submitted itself). Without
// JavaScript the `<form action>` posts to the action.
export function LeadStatusForm({ leadId, status, notes }: LeadStatusFormProps) {
  const [state, formAction, pending] = useActionState(updateLead, ADMIN_INITIAL_STATE);
  const id = useId();
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const statusId = `${id}-status`;
  const notesId = `${id}-notes`;
  const hintId = `${id}-notes-hint`;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <AdminCard>
      <form action={formAction} onSubmit={onSubmit} className={formStackClasses}>
        <h2 className="h3-card">Status și note</h2>
        <input type="hidden" name="leadId" value={leadId} />

        <Field>
          <Label htmlFor={statusId}>Status</Label>
          <Select id={statusId} name="status" defaultValue={status} invalid={Boolean(errors.status)}>
            {LEAD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
          <FieldError fieldId={statusId}>{errors.status}</FieldError>
        </Field>

        <Field>
          <Label htmlFor={notesId}>Note interne</Label>
          <Textarea
            id={notesId}
            name="notes"
            rows={6}
            defaultValue={notes ?? ""}
            maxLength={NOTES_MAX}
            invalid={Boolean(errors.notes)}
            aria-describedby={hintId}
          />
          <p id={hintId} className="text-[14px] leading-[1.4] text-muted">
            {NOTES_HINT}
          </p>
          <FieldError fieldId={notesId}>{errors.notes}</FieldError>
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Se salvează…" : "Salvează"}
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
