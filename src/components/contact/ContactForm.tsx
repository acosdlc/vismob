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
import { submitContact } from "@/actions/submit-contact";
import { Button } from "@/components/site/Button";
import { Eyebrow } from "@/components/site/Eyebrow";
import { Checkbox, Field, FieldError, FormCard, Input, Label, Select, Textarea, formStackClasses } from "@/components/site/form";
import {
  CONSENT_TEXT,
  FORM_FIELDS,
  INITIAL_FORM_STATE,
  MATTRESS_SIZES,
  type FieldErrors,
  type LeadSource,
} from "@/lib/leads/types";
import { contactSchema, parseLeadForm } from "@/lib/validation/schemas";
import { FileUpload } from "./FileUpload";
import { Turnstile } from "./Turnstile";

export interface ContactFormProps {
  /** `settings.response_time`, e.g. „24 de ore”: the bar and the confirmation read it. */
  responseTime: string;
  /** The page the form sits on („/” or „/contact”), stored in `leads.source.page`. */
  page: string;
  /** Level of the confirmation heading: 3 under the H2 of Acasă (default), 2 under the H1 of /contact. */
  confirmHeadingLevel?: 2 | 3;
}

/** The field order of DESIGN §4.1 09; the first invalid one gets the focus (§3.16). */
const FIELD_ORDER = ["name", "phone", "email", "mattressSize", "message", FORM_FIELDS.uploads, "wantsMeasurement", "privacy"];

/** The split of CONSENT_TEXT around the linked words (DESIGN §4.1 field 7). */
const CONSENT_LINK = "Politicii de confidențialitate";
const [CONSENT_BEFORE, CONSENT_AFTER] = CONSENT_TEXT.split(CONSENT_LINK);

/** What the hidden `source` input carries (ARHITECTURA §6.1; `environment` is added on the server). */
export function collectSource(page: string, location?: Pick<Location, "search">, referrer?: string): Omit<LeadSource, "environment"> {
  const source: Omit<LeadSource, "environment"> = { page };
  if (referrer) source.referrer = referrer;
  if (location) {
    const utm: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(location.search)) {
      if (key.startsWith("utm_") && value) utm[key] = value;
    }
    if (Object.keys(utm).length > 0) source.utm = utm;
  }
  return source;
}

/**
 * Focuses the first control (in DESIGN order) that has an error; returns whether one was
 * found. A field whose named control is hidden (`uploads`) is found through `data-field`.
 */
export function focusFirstInvalid(form: HTMLFormElement, errors: FieldErrors): boolean {
  for (const field of FIELD_ORDER) {
    if (!errors[field]) continue;
    const named = form.elements.namedItem(field);
    const visible = named instanceof HTMLElement && !(named instanceof HTMLInputElement && named.type === "hidden");
    const target = visible ? named : form.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (target) {
      target.focus();
      return true;
    }
  }
  return false;
}

const subscribeNoop = () => () => undefined;

// DESIGN §4.1 09 „Cerere de ofertă” and §3.16. `useActionState` drives the Server
// Action; a client pre-pass of the same Zod schema puts the focus on the first error
// without a round trip; without JavaScript the `<form action>` posts to the action.
export function ContactForm({ responseTime, page, confirmHeadingLevel = 3 }: ContactFormProps) {
  // „Trimite altă cerere” remounts the form, which resets useActionState and every field.
  const [round, setRound] = useState(0);
  return (
    <RequestForm
      key={round}
      responseTime={responseTime}
      page={page}
      confirmHeadingLevel={confirmHeadingLevel}
      onReset={() => setRound((r) => r + 1)}
    />
  );
}

function RequestForm({
  responseTime,
  page,
  confirmHeadingLevel,
  onReset,
}: ContactFormProps & { confirmHeadingLevel: 2 | 3; onReset: () => void }) {
  const ConfirmHeading = confirmHeadingLevel === 2 ? "h2" : "h3";
  const [state, formAction, pending] = useActionState(submitContact, INITIAL_FORM_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const [uploading, setUploading] = useState(false);
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

  // Server-side field errors (a submit without JavaScript, or a value the client let through).
  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors);
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
    formData.set(FORM_FIELDS.source, JSON.stringify(collectSource(page, window.location, document.referrer)));

    const result = parseLeadForm(formData, contactSchema);
    if (!result.ok) {
      setClientErrors(result.fieldErrors);
      focusFirstInvalid(form, result.fieldErrors);
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
    return (
      <FormCard bar={{ left: "Cerere de ofertă", right: `Răspuns în ${responseTime}` }}>
        <div className="flex flex-col gap-4">
          <Eyebrow className="text-accent">Cerere trimisă</Eyebrow>
          <ConfirmHeading ref={confirmHeadingRef} tabIndex={-1} className="h3-confirm outline-none">
            Mulțumim! Te sunăm în {responseTime}.
          </ConfirmHeading>
          <p className="text-ink-2">Între timp, poți să te uiți prin materiale sau să încerci configuratorul.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button href="/configurator" variant="primary">
              Configurator
            </Button>
            <Button variant="secondary" onClick={onReset}>
              Trimite altă cerere
            </Button>
          </div>
        </div>
      </FormCard>
    );
  }

  return (
    <FormCard bar={{ left: "Cerere de ofertă", right: `Răspuns în ${responseTime}` }}>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        noValidate={hydrated}
        onFocusCapture={requestToken}
        onPointerDownCapture={requestToken}
        className={formStackClasses}
      >
        {/* 1. Nume + Telefon */}
        <div className="flex flex-wrap gap-[18px]">
          <Field className="flex-[1_1_200px]">
            <Label htmlFor={field("name").id}>Nume</Label>
            <Input {...field("name")} name="name" type="text" autoComplete="name" />
            <FieldError fieldId={field("name").id}>{errors.name}</FieldError>
          </Field>
          <Field className="flex-[1_1_200px]">
            <Label htmlFor={field("phone").id}>Telefon</Label>
            <Input {...field("phone")} name="phone" type="tel" autoComplete="tel" />
            <FieldError fieldId={field("phone").id}>{errors.phone}</FieldError>
          </Field>
        </div>

        {/* 2. Email (obligatoriu, §3.16) */}
        <Field>
          <Label htmlFor={field("email").id}>Email</Label>
          <Input {...field("email")} name="email" type="email" autoComplete="email" required />
          <FieldError fieldId={field("email").id}>{errors.email}</FieldError>
        </Field>

        {/* 3. Dimensiunea saltelei */}
        <Field>
          <Label htmlFor={field("mattressSize").id}>Dimensiunea saltelei</Label>
          <Select {...field("mattressSize")} name="mattressSize" defaultValue={MATTRESS_SIZES[0]}>
            {MATTRESS_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
          <FieldError fieldId={field("mattressSize").id}>{errors.mattressSize}</FieldError>
        </Field>

        {/* 4. Ce pat îți dorești? */}
        <Field>
          <Label htmlFor={field("message").id}>Ce pat îți dorești?</Label>
          <Textarea {...field("message")} name="message" rows={4} />
          <FieldError fieldId={field("message").id}>{errors.message}</FieldError>
        </Field>

        {/* 5. Poze (opțional) */}
        <FileUpload id={`${id}-poze`} error={errors[FORM_FIELDS.uploads]} onUploadingChange={setUploading} />

        {/* 6. Măsurători */}
        <Checkbox {...field("wantsMeasurement")} name="wantsMeasurement">
          Vreau să veniți la măsurători
        </Checkbox>

        {/* 7. Acordul (obligatoriu) */}
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
        <input type="hidden" name={FORM_FIELDS.source} value={JSON.stringify(collectSource(page))} />
        <Turnstile />

        {state.status === "error" && (
          <p role="alert" className="text-[14px] leading-[1.4] text-error">
            {state.message}
          </p>
        )}

        {/* 8. Trimite */}
        <div>
          <Button type="submit" variant="primary" disabled={pending || uploading} aria-busy={pending || undefined}>
            {pending ? "Se trimite…" : "Trimite cererea"}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
