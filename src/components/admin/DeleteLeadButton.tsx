"use client";

import { useActionState, type FormEvent } from "react";
import { deleteLead } from "@/actions/admin/delete-lead";
import { Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { ADMIN_INITIAL_STATE } from "@/lib/admin/types";

export interface DeleteLeadButtonProps {
  leadId: string;
  /** The client's name, read back in the confirmation. */
  name: string;
}

/** The browser's confirmation before the delete. */
export function deleteConfirmText(name: string): string {
  return `Ștergi definitiv cererea de la ${name}? Pozele ei se șterg și ele.`;
}

// PLAN PR-7 „Cereri”: one secondary button that asks the browser's confirmation,
// then posts to the `deleteLead` Server Action, which redirects to the list on
// success; only an error ever comes back into the state. Without JavaScript the
// form posts straight to the action (no confirmation then, the action still checks the role).
export function DeleteLeadButton({ leadId, name }: DeleteLeadButtonProps) {
  const [state, formAction, pending] = useActionState(deleteLead, ADMIN_INITIAL_STATE);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(deleteConfirmText(name))) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Se șterge…" : "Șterge cererea"}
        </Button>
        <span className="mono-13 text-muted">Ștergerea e definitivă.</span>
      </div>
      {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
    </form>
  );
}
