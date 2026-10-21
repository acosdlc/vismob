"use client";

import { useActionState, useId } from "react";
import { signIn } from "@/actions/admin/sign-in";
import { Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Field, FieldError, Input, Label, formStackClasses } from "@/components/site/form";
import { ADMIN_INITIAL_STATE } from "@/lib/admin/types";

// DESIGN §4.8 and §3.16: email + password, one primary button. `useActionState`
// drives the `signIn` Server Action; without JavaScript the form posts to it. No
// Turnstile, no honeypot: the admin forms are behind credentials.
export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, ADMIN_INITIAL_STATE);
  const id = useId();
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;

  return (
    <form action={formAction} className={formStackClasses}>
      <Field>
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="username"
          required
          invalid={Boolean(errors.email)}
        />
        <FieldError fieldId={emailId}>{errors.email}</FieldError>
      </Field>

      <Field>
        <Label htmlFor={passwordId}>Parolă</Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(errors.password)}
        />
        <FieldError fieldId={passwordId}>{errors.password}</FieldError>
      </Field>

      {state.status === "error" && <Notice tone="error">{state.message}</Notice>}

      <div>
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Se verifică…" : "Intră"}
        </Button>
      </div>
    </form>
  );
}
