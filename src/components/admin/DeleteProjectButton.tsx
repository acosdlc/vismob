"use client";

import { useActionState, type FormEvent } from "react";
import { deleteProject } from "@/actions/admin/delete-project";
import { Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { ADMIN_INITIAL_STATE } from "@/lib/admin/types";

export interface DeleteProjectButtonProps {
  id: string;
  /** The project's title, read back in the confirmation. */
  title: string;
}

export const DELETE_PROJECT_TEXTS = {
  submit: "Șterge proiectul",
  submitting: "Se șterge…",
} as const;

/** The browser's confirmation before the delete. */
export function deleteProjectConfirmText(title: string): string {
  return `Ștergi definitiv proiectul „${title}” și pozele lui?`;
}

// PLAN PR-9 „Lucrări”: one secondary button that asks the browser's confirmation, then
// posts to the `deleteProject` Server Action, which removes the row, its photo rows
// (cascade) and their objects, and redirects to the overview on success; only an error
// ever comes back into the state. Without JavaScript the form posts straight to the
// action (no confirmation then, the action still checks the role).
export function DeleteProjectButton({ id, title }: DeleteProjectButtonProps) {
  const [state, formAction, pending] = useActionState(deleteProject, ADMIN_INITIAL_STATE);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(deleteProjectConfirmText(title))) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? DELETE_PROJECT_TEXTS.submitting : DELETE_PROJECT_TEXTS.submit}
        </Button>
      </div>
      {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
    </form>
  );
}
