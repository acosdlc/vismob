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
import { submitSamples } from "@/actions/submit-samples";
import { Turnstile } from "@/components/contact/Turnstile";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label, Textarea, formStackClasses } from "@/components/site/form";
import { collectSource, focusFirstInvalid } from "@/components/site/form/helpers";
import { CONSENT_TEXT, FORM_FIELDS, INITIAL_FORM_STATE, type FieldErrors } from "@/lib/leads/types";
import { samplesDeliveryNote } from "@/lib/materials/delivery-note";
import { parseLeadForm, samplesSchema } from "@/lib/validation/schemas";
import { SAMPLES_FIELDS, type SampleBoxApi, type SampleItem, type MaterialsSettings } from "./types";

/** The page the form sits on, stored in `leads.source.page`. */
const PAGE = "/materiale";

/** The field order of DESIGN §4.3; the first invalid one gets the focus (§3.16). */
const FIELD_ORDER = ["name", "phone", "email", "address", "privacy"] as const;

/** The split of CONSENT_TEXT around the linked words (DESIGN §4.1 field 7). */
const CONSENT_LINK = "Politicii de confidențialitate";
const [CONSENT_BEFORE, CONSENT_AFTER] = CONSENT_TEXT.split(CONSENT_LINK);

const subscribeNoop = () => () => undefined;

/** The note under the submit button (DESIGN §4.3), from the shared builder. */
export function deliveryNote(settings: Pick<MaterialsSettings, "samples_delivery" | "samples_free">): string {
  return samplesDeliveryNote(settings.samples_delivery, settings.samples_free);
}

export interface SamplesFormProps {
  /** The chosen items, in box order (what the client pre-pass accepts as known ids). */
  items: SampleItem[];
  box: SampleBoxApi;
  settings: MaterialsSettings;
  /** Called once the server has stored the request; the box then shows the confirmation. */
  onSent: () => void;
}

// DESIGN §4.3 and §3.16, after src/components/configurator/QuoteForm.tsx: `useActionState`
// drives the Server Action, a client pre-pass of the same Zod schema puts the focus on the
// first error, and without JavaScript the `<form action>` posts to the action. The box's ids
// travel in a hidden input that follows `box.ids`; the server keeps only the ids it knows,
// 1 … settings.sample_limit of them. No FormCard: the form sits inside the box, under a
// dashed rule.
export function SamplesForm({ items, box, settings, onSent }: SamplesFormProps) {
  const [state, formAction, pending] = useActionState(submitSamples, INITIAL_FORM_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const tokenRequested = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
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
  const idsValue = JSON.stringify(box.ids);
  const empty = box.ids.length === 0;

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
    if (state.status === "ok") onSent();
  }, [state, onSent]);

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

    // The box already holds only catalogue ids, so they are the known set for the pre-pass.
    const result = parseLeadForm(
      formData,
      samplesSchema(
        settings.sample_limit,
        items.map((item) => item.id),
      ),
    );
    if (!result.ok) {
      setClientErrors(result.fieldErrors);
      focusFirstInvalid(form, result.fieldErrors, FIELD_ORDER);
      return;
    }
    setClientErrors(null);
    startTransition(() => formAction(formData));
  }

  const field = (name: string) => ({
    id: `${id}-${name}`,
    invalid: Boolean(errors[name]),
  });

  // The ids' error only comes from the server (the button is disabled while the box is empty).
  const idsError = serverErrors?.[SAMPLES_FIELDS.ids];

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate={hydrated}
      onFocusCapture={requestToken}
      onPointerDownCapture={requestToken}
      className={`${formStackClasses} border-t border-dashed border-ink pt-[18px]`}
    >
      <Field>
        <Label htmlFor={field("name").id}>Nume</Label>
        <Input {...field("name")} name="name" type="text" autoComplete="name" required />
        <FieldError fieldId={field("name").id}>{errors.name}</FieldError>
      </Field>
      <Field>
        <Label htmlFor={field("phone").id}>Telefon</Label>
        <Input {...field("phone")} name="phone" type="tel" autoComplete="tel" required />
        <FieldError fieldId={field("phone").id}>{errors.phone}</FieldError>
      </Field>
      <Field>
        <Label htmlFor={field("email").id}>Email</Label>
        <Input {...field("email")} name="email" type="email" autoComplete="email" required />
        <FieldError fieldId={field("email").id}>{errors.email}</FieldError>
      </Field>
      <Field>
        <Label htmlFor={field("address").id}>Adresa de livrare</Label>
        <Textarea {...field("address")} name="address" rows={2} autoComplete="street-address" required />
        <FieldError fieldId={field("address").id}>{errors.address}</FieldError>
      </Field>

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

      {/* The box's ids (Color.ids, in box order); the server keeps only the ones it knows. */}
      <input type="hidden" name={SAMPLES_FIELDS.ids} value={idsValue} />
      {idsError && (state.status !== "error" || state.message !== idsError) && (
        <p role="alert" className="text-[14px] leading-[1.4] text-error">
          {idsError}
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

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={pending || empty}
          aria-busy={pending || undefined}
        >
          {pending ? "Se trimite…" : "Trimite-mi mostrele"}
        </Button>
        <p className="mono-12 text-muted">{deliveryNote(settings)}</p>
      </div>
    </form>
  );
}
