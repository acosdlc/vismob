"use client";

import { useActionState, type FormEvent } from "react";
import { deleteReview } from "@/actions/admin/delete-review";
import { Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { ADMIN_INITIAL_STATE } from "@/lib/admin/types";

export interface DeleteReviewButtonProps {
  id: string;
  /** The review's name as the table shows it („Ana, Cluj”), read back in the confirmation. */
  name: string;
}

/** The browser's confirmation before the delete. */
export function deleteReviewConfirmText(name: string): string {
  return `Ștergi definitiv recenzia de la ${name}?`;
}

// PLAN PR-9 „Recenzii”: one secondary button that asks the browser's confirmation,
// then posts to the `deleteReview` Server Action, which redirects to the list on
// success; only an error ever comes back into the state. Without JavaScript the form
// posts straight to the action (no confirmation then, the action still checks the role).
export function DeleteReviewButton({ id, name }: DeleteReviewButtonProps) {
  const [state, formAction, pending] = useActionState(deleteReview, ADMIN_INITIAL_STATE);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(deleteReviewConfirmText(name))) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Se șterge…" : "Șterge recenzia"}
        </Button>
      </div>
      {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
    </form>
  );
}
