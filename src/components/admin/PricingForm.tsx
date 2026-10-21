"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { savePricing } from "@/actions/admin/save-pricing";
import { AdminCard, AdminSection, Notice, Table, TableWrap, Tag, Td, Th, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Field, FieldError, Input, Label } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { formatPrice } from "@/lib/configurator/format";
import type { Pricing } from "@/lib/configurator/pricing";
import {
  PRICING_BASE_IDS,
  PRICING_CATEGORIES,
  PRICING_FIELD_ORDER,
  PRICING_FIELDS,
  PRICING_HEIGHTS,
  PRICING_MESSAGES,
  PRICING_MODEL_IDS,
  PRICING_WIDTHS,
  parsePricingForm,
  previewPrices,
  type PreviewPrice,
} from "@/lib/configurator/pricing-schema";
import type { Catalog } from "@/lib/configurator/types";
import type { FieldErrors } from "@/lib/leads/types";

export interface PricingFormProps {
  /** The saved grid, or null when there is none yet (or the saved one is invalid): the fields start empty. */
  pricing: Pricing | null;
  /** The site's catalogue: the names and codes of models and bases, and the preview's colours. */
  catalog: Catalog;
}

/** Under the preview while the form does not parse: the prices shown are the last valid ones. */
const INCOMPLETE = "Completează toate câmpurile cu numere valide ca să vezi prețurile.";

/** Under „Rotunjire (lei)”. */
const ROUND_HINT = "Prețul se rotunjește la acest pas, de exemplu 50.";

const HINT_CLASSES = "text-[14px] leading-[1.4] text-muted";

// DESIGN §4.8 „Catalog și prețuri”: the grid is a table with a row per model and a
// column per standard width, each cell an Input; the preview of the three typical
// configurations uses the site's own functions (previewPrices). The inputs are
// uncontrolled and the submit goes through `onSubmit`, not the form's `action` path,
// because React resets a form it submitted itself once the action settles: here what
// the admin typed stays in place after a save. Without JavaScript the `<form action>`
// posts to the action. Field errors come from the server; the live preview only says
// when the form does not parse yet.
export function PricingForm({ pricing, catalog }: PricingFormProps) {
  const [state, formAction, pending] = useActionState(savePricing, ADMIN_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  // The last valid preview, and whether the form parses right now. With no grid the
  // fields start empty, so the form starts incomplete.
  const [preview, setPreview] = useState<PreviewPrice[]>(() => previewPrices(catalog, pricing));
  const [incomplete, setIncomplete] = useState(pricing === null);

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, PRICING_FIELD_ORDER);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  /** Every change re-reads the whole form: the preview follows what the admin types. */
  function onChange() {
    if (!formRef.current) return;
    const parsed = parsePricingForm(new FormData(formRef.current));
    if (parsed.ok) {
      setPreview(previewPrices(catalog, parsed.data));
      setIncomplete(false);
    } else {
      setIncomplete(true);
    }
  }

  /** `${id}-grid-capitonat-160`: the input's id, from its posted name. */
  const fieldId = (name: string) => `${id}-${name.replace(/\./g, "-")}`;
  const gridHintId = `${id}-grid-hint`;

  // The grid and the bases cover the closed sets (every model, every base: the parser
  // needs all of them, and a row the public catalogue leaves out, e.g. an inactive
  // model, must keep its prices). Names and codes come from the catalogue; for a row it
  // does not carry, from the seed, which has the same ids.
  const models = PRICING_MODEL_IDS.map(
    (modelId) => catalog.models.find((m) => m.id === modelId) ?? SEED_CATALOG.models.find((m) => m.id === modelId)!,
  );
  const bases = PRICING_BASE_IDS.map(
    (baseId) => catalog.bases.find((b) => b.id === baseId) ?? SEED_CATALOG.bases.find((b) => b.id === baseId)!,
  );

  const amount = (value: number | undefined) => (value === undefined ? "" : String(value));

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      onChange={onChange}
      noValidate
      autoComplete="off"
      className="flex flex-col gap-8"
    >
      <AdminSection title="Preț de bază pe lățime (lei)">
        <AdminCard className="flex flex-col gap-[18px]">
          <p id={gridHintId} className={HINT_CLASSES}>
            {PRICING_MESSAGES.grid}
          </p>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>cm</Th>
                  {PRICING_WIDTHS.map((width) => (
                    <Th key={width}>{width}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.id}>
                    <Td className="whitespace-nowrap">
                      <span className="flex flex-wrap items-center gap-2 pt-3">
                        <span className="font-semibold">{model.name}</span>
                        <Tag>{model.code}</Tag>
                      </span>
                    </Td>
                    {PRICING_WIDTHS.map((width) => {
                      const name = PRICING_FIELDS.grid(model.id, width);
                      const cellId = fieldId(name);
                      const error = errors[name];
                      return (
                        <Td key={width}>
                          <Input
                            id={cellId}
                            name={name}
                            type="text"
                            inputMode="decimal"
                            defaultValue={amount(pricing?.grid[model.id]?.[width])}
                            invalid={Boolean(error)}
                            aria-label={`${model.name}, ${width} cm`}
                            aria-describedby={gridHintId}
                            className="min-w-24"
                          />
                          <FieldError fieldId={cellId} className="mt-[6px]">
                            {error}
                          </FieldError>
                        </Td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </AdminCard>
      </AdminSection>

      <AdminSection title="Adaos pe categoria materialului (%)">
        <AdminCard>
          <div className={fieldGridClasses}>
            {PRICING_CATEGORIES.map((category) => {
              const name = PRICING_FIELDS.categoryPct(category);
              return (
                <AmountField
                  key={name}
                  id={fieldId(name)}
                  name={name}
                  label={`Categoria ${category}`}
                  defaultValue={amount(pricing?.categoryPct[category])}
                  error={errors[name]}
                />
              );
            })}
          </div>
        </AdminCard>
      </AdminSection>

      <AdminSection title="Adaos pe înălțimea tăbliei (%)">
        <AdminCard>
          <div className={fieldGridClasses}>
            {PRICING_HEIGHTS.map((height) => {
              const name = PRICING_FIELDS.hbPct(height);
              return (
                <AmountField
                  key={name}
                  id={fieldId(name)}
                  name={name}
                  label={`${height} cm`}
                  defaultValue={amount(pricing?.hbPct[height])}
                  error={errors[name]}
                />
              );
            })}
          </div>
        </AdminCard>
      </AdminSection>

      <AdminSection title="Picioare și baze (lei)">
        <AdminCard>
          <div className={fieldGridClasses}>
            {bases.map((base) => {
              const name = PRICING_FIELDS.base(base.id);
              return (
                <AmountField
                  key={name}
                  id={fieldId(name)}
                  name={name}
                  label={base.name}
                  defaultValue={amount(pricing?.base[base.id])}
                  error={errors[name]}
                />
              );
            })}
          </div>
        </AdminCard>
      </AdminSection>

      <AdminSection title="Extra (lei)">
        <AdminCard>
          <div className={fieldGridClasses}>
            <AmountField
              id={fieldId(PRICING_FIELDS.extras.led)}
              name={PRICING_FIELDS.extras.led}
              label="LED sub pat"
              defaultValue={amount(pricing?.extras.led)}
              error={errors[PRICING_FIELDS.extras.led]}
            />
            <AmountField
              id={fieldId(PRICING_FIELDS.extras.nightstands)}
              name={PRICING_FIELDS.extras.nightstands}
              label="2 noptiere"
              defaultValue={amount(pricing?.extras.nightstands)}
              error={errors[PRICING_FIELDS.extras.nightstands]}
            />
          </div>
        </AdminCard>
      </AdminSection>

      <AdminSection title="Alte reguli">
        <AdminCard>
          <div className={fieldGridClasses}>
            <AmountField
              id={fieldId(PRICING_FIELDS.customPct)}
              name={PRICING_FIELDS.customPct}
              label="Adaos pentru dimensiune nestandard (%)"
              defaultValue={amount(pricing?.customPct)}
              error={errors[PRICING_FIELDS.customPct]}
            />
            <AmountField
              id={fieldId(PRICING_FIELDS.roundTo)}
              name={PRICING_FIELDS.roundTo}
              label="Rotunjire (lei)"
              hint={ROUND_HINT}
              defaultValue={amount(pricing?.roundTo)}
              error={errors[PRICING_FIELDS.roundTo]}
            />
          </div>
        </AdminCard>
      </AdminSection>

      <AdminSection title="Previzualizare">
        <AdminCard className="flex flex-col gap-[18px]">
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Configurație</Th>
                  <Th className="text-right">Preț orientativ</Th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.label}>
                    <Td>{row.label}</Td>
                    <Td className="mono-13 text-right whitespace-nowrap">
                      {row.price === null ? "—" : formatPrice(row.price)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          {incomplete && <p className="mono-13 text-muted">{INCOMPLETE}</p>}
        </AdminCard>
      </AdminSection>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-4 border-t border-rule bg-paper py-4">
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Se salvează…" : "Salvează"}
        </Button>
        <SaveNotice state={state} pending={pending} />
      </div>
    </form>
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

interface AmountFieldProps {
  id: string;
  name: string;
  label: ReactNode;
  hint?: string;
  defaultValue: string;
  error?: string;
}

/** A labelled number field (lei or %): a text input with the decimal keyboard, the server's error under it. */
function AmountField({ id, name, label, hint, defaultValue, error }: AmountFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <Field>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        defaultValue={defaultValue}
        invalid={Boolean(error)}
        aria-describedby={hintId}
      />
      {hint && (
        <p id={hintId} className={HINT_CLASSES}>
          {hint}
        </p>
      )}
      <FieldError fieldId={id}>{error}</FieldError>
    </Field>
  );
}
