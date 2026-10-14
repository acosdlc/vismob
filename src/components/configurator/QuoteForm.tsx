"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { issueFormToken } from "@/actions/issue-form-token";
import { submitQuote } from "@/actions/submit-quote";
import { collectSource, focusFirstInvalid } from "@/components/site/form/helpers";
import { Turnstile } from "@/components/contact/Turnstile";
import { Button } from "@/components/site/Button";
import { Eyebrow } from "@/components/site/Eyebrow";
import { Checkbox, Field, FieldError, FormCard, Input, Label, Textarea, formStackClasses } from "@/components/site/form";
import { paramsFromConfig } from "@/lib/configurator/url";
import { CONSENT_TEXT, FORM_FIELDS, INITIAL_FORM_STATE, type FieldErrors } from "@/lib/leads/types";
import { parseLeadForm, quoteSchema } from "@/lib/validation/schemas";
import { QUOTE_FIELDS, type QuoteSectionProps } from "./types";

/** The page the form sits on, stored in `leads.source.page`. */
const PAGE = "/configurator";

/** The field order of DESIGN §4.2 07; the first invalid one gets the focus (§3.16). */
const QUOTE_FIELD_ORDER = ["name", "phone", "email", "city", "message", "wantsMeasurement", "privacy"] as const;

/** The split of CONSENT_TEXT around the linked words (DESIGN §4.2). */
const CONSENT_LINK = "Politicii de confidențialitate";
const [CONSENT_BEFORE, CONSENT_AFTER] = CONSENT_TEXT.split(CONSENT_LINK);

const subscribeNoop = () => () => undefined;

/**
 * After the contact order (focusFirstInvalid), any other field with an error whose
 * control is visible (`city`, which the contact form does not have).
 */
function focusInvalid(form: HTMLFormElement, errors: FieldErrors) {
  if (focusFirstInvalid(form, errors, QUOTE_FIELD_ORDER)) return;
  for (const name of Object.keys(errors)) {
    const named = form.elements.namedItem(name);
    if (named instanceof HTMLElement && !(named instanceof HTMLInputElement && named.type === "hidden")) {
      named.focus();
      return;
    }
  }
}

// DESIGN §4.2 07 and §3.16, after src/components/contact/ContactForm.tsx: `useActionState`
// drives the Server Action, a client pre-pass of the same Zod schema puts the focus on the
// first error, and without JavaScript the `<form action>` posts to the action. The
// configuration travels in a hidden input that follows the `config` prop; the server
// recomputes the code and the price from it (§5.7).
export function QuoteForm(props: QuoteSectionProps) {
  // „Modifică configurația” remounts the form: useActionState resets, the configuration
  // stays (it is still in the URL and in the props).
  const [round, setRound] = useState(0);
  return <QuoteRequestForm key={round} {...props} onReset={() => setRound((r) => r + 1)} />;
}

function QuoteRequestForm({ config, code, responseTime, onReset }: QuoteSectionProps & { onReset: () => void }) {
  const [state, formAction, pending] = useActionState(submitQuote, INITIAL_FORM_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const tokenRequested = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  // Native validation stays on for a submit without JavaScript; once hydrated, the Zod
  // pre-pass gives every field the same message and the focus goes to the first error.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const serverErrors = state.status === "error" ? state.fieldErrors : undefined;
  const errors: FieldErrors = clientErrors ?? serverErrors ?? {};
  const configValue = paramsFromConfig(config).toString();

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusInvalid(formRef.current, state.fieldErrors);
    }
    if (state.status === "ok") confirmHeadingRef.current?.focus();
  }, [state]);

  function requestToken() {
    if (tokenRequested.current) return;
    tokenRequested.current = true;
    issueFormToken()
      .then((token) => setStartedAt(token))
      .catch(() => setStartedAt(""));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set(FORM_FIELDS.source, JSON.stringify(collectSource(PAGE, window.location, document.referrer)));

    const result = parseLeadForm(formData, quoteSchema);
    if (!result.ok) {
      setClientErrors(result.fieldErrors);
      focusInvalid(form, result.fieldErrors);
      return;
    }
    setClientErrors(null);
    startTransition(() => formAction(formData));
  }

  const field = (name: string) => ({
    id: `${id}-${name}`,
    invalid: Boolean(errors[name]),
  });

  if (state.status === "ok") {
    // The code the server recomputed; the prop is the same configuration, as a fallback.
    const sentCode = state.code ?? code;
    return (
      <FormCard>
        <div className="flex flex-col gap-4">
          <Eyebrow className="text-accent">Configurație trimisă · {sentCode}</Eyebrow>
          <h3 ref={confirmHeadingRef} tabIndex={-1} className="h3-confirm outline-none">
            Mulțumim! Te sunăm în {responseTime}.
          </h3>
          <p className="text-ink-2">
            Am primit desenul și alegerile tale. Dacă vrei să vezi materialele înainte, cere mostrele acum și le
            primești odată cu oferta.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button href="/materiale" variant="primary">
              Cere mostre
            </Button>
            <Button variant="secondary" onClick={onReset}>
              Modifică configurația
            </Button>
          </div>
        </div>
      </FormCard>
    );
  }

  return (
    <FormCard>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        noValidate={hydrated}
        onFocusCapture={requestToken}
        onPointerDownCapture={requestToken}
        className={formStackClasses}
      >
        {/* Configurația atașată · {cod}: paper, 1px dashed field, DM Mono 13px */}
        <div
          className="mono-13 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-ui border border-dashed border-field bg-paper px-[14px] py-3"
          data-testid="attached-config"
        >
          <span className="text-muted">Configurația atașată</span>
          <span data-testid="attached-code">{code}</span>
        </div>

        {/* Nume · Telefon · Email (obligatoriu) · Localitate, grid minmax(min(220px,100%),1fr) */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-[18px]">
          <Field>
            <Label htmlFor={field("name").id}>Nume</Label>
            <Input {...field("name")} name="name" type="text" autoComplete="name" />
            <FieldError fieldId={field("name").id}>{errors.name}</FieldError>
          </Field>
          <Field>
            <Label htmlFor={field("phone").id}>Telefon</Label>
            <Input {...field("phone")} name="phone" type="tel" autoComplete="tel" />
            <FieldError fieldId={field("phone").id}>{errors.phone}</FieldError>
          </Field>
          <Field>
            <Label htmlFor={field("email").id}>Email</Label>
            <Input {...field("email")} name="email" type="email" autoComplete="email" required />
            <FieldError fieldId={field("email").id}>{errors.email}</FieldError>
          </Field>
          <Field>
            <Label htmlFor={field("city").id}>Localitate</Label>
            <Input {...field("city")} name="city" type="text" autoComplete="address-level2" />
            <FieldError fieldId={field("city").id}>{errors.city}</FieldError>
          </Field>
        </div>

        {/* Detalii (opțional) */}
        <Field>
          <Label htmlFor={field("message").id}>Detalii (opțional)</Label>
          <Textarea {...field("message")} name="message" rows={3} />
          <FieldError fieldId={field("message").id}>{errors.message}</FieldError>
        </Field>

        <Checkbox {...field("wantsMeasurement")} name="wantsMeasurement">
          Vreau să veniți la măsurători
        </Checkbox>

        <Field>
          <Checkbox {...field("privacy")} name="privacy" required>
            {CONSENT_BEFORE}
            <Link href="/confidentialitate" className="underline">
              {CONSENT_LINK}
            </Link>
            {CONSENT_AFTER}
          </Checkbox>
          <FieldError fieldId={field("privacy").id}>{errors.privacy}</FieldError>
        </Field>

        {/* The configuration (DESIGN §5.3), re-sent on every submit; the server resolves it. */}
        <input type="hidden" name={QUOTE_FIELDS.config} value={configValue} />
        {errors[QUOTE_FIELDS.config] && (state.status !== "error" || state.message !== errors[QUOTE_FIELDS.config]) && (
          <p role="alert" className="text-[14px] leading-[1.4] text-error">
            {errors[QUOTE_FIELDS.config]}
          </p>
        )}

        {/* Anti-spam and bookkeeping (ARHITECTURA §6.1 step 3.1; hidden, never shown). */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor={`${id}-${FORM_FIELDS.honeypot}`}>Lasă acest câmp gol</label>
          <input
            id={`${id}-${FORM_FIELDS.honeypot}`}
            name={FORM_FIELDS.honeypot}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        <input type="hidden" name={FORM_FIELDS.startedAt} value={startedAt} />
        <input type="hidden" name={FORM_FIELDS.source} value={JSON.stringify(collectSource(PAGE))} />
        <Turnstile />

        {state.status === "error" && (
          <p role="alert" className="text-[14px] leading-[1.4] text-error">
            {state.message}
          </p>
        )}

        <div>
          <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Se trimite…" : "Trimite configurația"}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
