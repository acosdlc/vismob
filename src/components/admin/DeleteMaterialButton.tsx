"use client";

import { useActionState, type FormEvent } from "react";
import { deleteMaterial } from "@/actions/admin/delete-material";
import { Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { ADMIN_INITIAL_STATE } from "@/lib/admin/types";

export interface DeleteMaterialButtonProps {
  id: string;
  /** The material's name, read back in the confirmation. */
  name: string;
}

/** The browser's confirmation before the delete. */
export function deleteMaterialConfirmText(name: string): string {
  return `Ștergi definitiv materialul ${name}? Dacă e folosit, ștergerea e refuzată.`;
}

// PLAN PR-8 „Materiale”: one secondary button that asks the browser's confirmation,
// then posts to the `deleteMaterial` Server Action, which redirects to the catalogue
// on success; only a refusal or an error ever comes back into the state (a material
// a project or a request still references stays, deactivated instead). Without
// JavaScript the form posts straight to the action (no confirmation then, the
// action still checks the role and the references).
export function DeleteMaterialButton({ id, name }: DeleteMaterialButtonProps) {
  const [state, formAction, pending] = useActionState(deleteMaterial, ADMIN_INITIAL_STATE);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(deleteMaterialConfirmText(name))) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Se șterge…" : "Șterge materialul"}
        </Button>
      </div>
      {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
    </form>
  );
}
