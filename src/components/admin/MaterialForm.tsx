"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { saveMaterial } from "@/actions/admin/save-material";
import { DeleteMaterialButton } from "@/components/admin/DeleteMaterialButton";
import { PhotoField } from "@/components/admin/PhotoField";
import { AdminCard, Notice, Tag, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label, Select } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { HEX_PATTERN, PRICE_CATEGORIES } from "@/lib/admin/materials";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";
import type { Tables } from "@/lib/supabase/database.types";

/** The row the form edits; null for a new material. */
export type MaterialFormMaterial = Pick<
  Tables<"materials">,
  "id" | "family_id" | "name" | "code" | "hex" | "supplier" | "supplier_code" | "price_category" | "photo_path" | "featured" | "active" | "sort"
>;

export type MaterialFormFamily = Pick<Tables<"material_families">, "id" | "name" | "code">;

export interface MaterialFormProps {
  material: MaterialFormMaterial | null;
  /** The families the select offers, in catalogue order. */
  families: MaterialFormFamily[];
}

export const MATERIAL_FORM_TEXTS = {
  family: "Familie",
  familyFixed: "Familia și codul nu se schimbă după creare.",
  name: "Nume",
  code: "Cod",
  hex: "Culoare",
  hexPlaceholder: "#2F4B3C",
  supplier: "Furnizor",
  supplierCode: "Cod furnizor",
  priceCategory: "Categorie de preț",
  priceCategoryHint: "A e cea mai ieftină; adaosul pe categorie e în Prețuri.",
  featured: "Apare pe Acasă (grila de 8 mostre)",
  active: "Activ (apare în configurator și pe Materiale)",
  sort: "Ordine",
  photo: "Poză (pătrată)",
  photoHint: "Mostra fotografiată de aproape, cel puțin 600 × 600 px.",
  submit: "Salvează",
  submitting: "Se salvează…",
} as const;

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = [
  "family_id",
  "name",
  "hex",
  "supplier",
  "supplier_code",
  "price_category",
  "sort",
  "featured",
  "active",
  PHOTO_FIELDS.path,
];

const HINT = "text-[14px] leading-[1.4] text-muted";

/** The object-name slug of a row that has no id yet (PhotoField); the uuid keeps two drafts apart. */
function draftSlug(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `nou-${Date.now()}`;
}

// PLAN PR-8 „Materiale”, DESIGN §4.8: one card over every editable column of a
// material. `useActionState` drives the `saveMaterial` Server Action; the submit goes
// through `onSubmit` so the typed values stay in place after a save (React resets a
// form it submitted itself). A new material posts an empty hidden `id` and lands on
// its own screen (the action redirects); an existing one keeps its family and code
// (the select is disabled, a hidden input carries the family; neither is editable).
// The submit is held while PhotoField is still uploading. Without JavaScript the
// `<form action>` posts to the action. No client pre-pass: the admin reads the
// server's field errors.
export function MaterialForm({ material, families }: MaterialFormProps) {
  const [state, formAction, pending] = useActionState(saveMaterial, ADMIN_INITIAL_STATE);
  const [hex, setHex] = useState(material?.hex ?? "");
  const [uploading, setUploading] = useState(false);
  const [slug] = useState(() => material?.id ?? draftSlug());
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const editing = material !== null;

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The disabled button already blocks the submit; this covers a scripted one.
    if (uploading) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const familyId = `${id}-family`;
  const familyHintId = `${id}-family-hint`;
  const nameId = `${id}-name`;
  const hexId = `${id}-hex`;
  const supplierId = `${id}-supplier`;
  const supplierCodeId = `${id}-supplier-code`;
  const categoryId = `${id}-category`;
  const categoryHintId = `${id}-category-hint`;
  const featuredId = `${id}-featured`;
  const activeId = `${id}-active`;
  const sortId = `${id}-sort`;
  const photoId = `${id}-photo`;
  const held = pending || uploading;

  return (
    <div className="flex flex-col gap-8">
      <AdminCard>
        <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-6">
          <input type="hidden" name="id" value={material?.id ?? ""} />
          {editing && <input type="hidden" name="family_id" value={material.family_id} />}

          <div className={fieldGridClasses}>
            <Field>
              <Label htmlFor={familyId}>{MATERIAL_FORM_TEXTS.family}</Label>
              <Select
                id={familyId}
                name={editing ? undefined : "family_id"}
                defaultValue={material?.family_id ?? families[0]?.id ?? ""}
                disabled={editing}
                invalid={Boolean(errors.family_id)}
                aria-describedby={editing ? familyHintId : undefined}
              >
                {families.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.name} ({family.code})
                  </option>
                ))}
              </Select>
              {editing && (
                <p id={familyHintId} className={HINT}>
                  {MATERIAL_FORM_TEXTS.familyFixed}
                </p>
              )}
              <FieldError fieldId={familyId}>{errors.family_id}</FieldError>
            </Field>

            {editing && (
              <Field>
                <span className="text-[14px] leading-[1.4] font-semibold text-ink">{MATERIAL_FORM_TEXTS.code}</span>
                <div className="flex min-h-12 items-center">
                  <Tag>{material.code}</Tag>
                </div>
              </Field>
            )}

            <Field>
              <Label htmlFor={nameId}>{MATERIAL_FORM_TEXTS.name}</Label>
              <Input id={nameId} name="name" type="text" defaultValue={material?.name ?? ""} maxLength={80} invalid={Boolean(errors.name)} />
              <FieldError fieldId={nameId}>{errors.name}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={hexId}>{MATERIAL_FORM_TEXTS.hex}</Label>
              <div className="flex items-start gap-3">
                <Input
                  id={hexId}
                  name="hex"
                  type="text"
                  value={hex}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setHex(event.currentTarget.value)}
                  maxLength={7}
                  placeholder={MATERIAL_FORM_TEXTS.hexPlaceholder}
                  spellCheck={false}
                  invalid={Boolean(errors.hex)}
                  className="font-mono"
                />
                <span
                  aria-hidden="true"
                  data-testid="hex-preview"
                  className="size-11 shrink-0 border border-[rgba(24,25,27,.25)] bg-card"
                  style={HEX_PATTERN.test(hex) ? { backgroundColor: hex } : undefined}
                />
              </div>
              <FieldError fieldId={hexId}>{errors.hex}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={supplierId}>{MATERIAL_FORM_TEXTS.supplier}</Label>
              <Input
                id={supplierId}
                name="supplier"
                type="text"
                defaultValue={material?.supplier ?? ""}
                maxLength={120}
                invalid={Boolean(errors.supplier)}
              />
              <FieldError fieldId={supplierId}>{errors.supplier}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={supplierCodeId}>{MATERIAL_FORM_TEXTS.supplierCode}</Label>
              <Input
                id={supplierCodeId}
                name="supplier_code"
                type="text"
                defaultValue={material?.supplier_code ?? ""}
                maxLength={60}
                invalid={Boolean(errors.supplier_code)}
              />
              <FieldError fieldId={supplierCodeId}>{errors.supplier_code}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={categoryId}>{MATERIAL_FORM_TEXTS.priceCategory}</Label>
              <Select
                id={categoryId}
                name="price_category"
                defaultValue={material?.price_category ?? PRICE_CATEGORIES[0]}
                invalid={Boolean(errors.price_category)}
                aria-describedby={categoryHintId}
              >
                {PRICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
              <p id={categoryHintId} className={HINT}>
                {MATERIAL_FORM_TEXTS.priceCategoryHint}
              </p>
              <FieldError fieldId={categoryId}>{errors.price_category}</FieldError>
            </Field>

            <Field>
              <Label htmlFor={sortId}>{MATERIAL_FORM_TEXTS.sort}</Label>
              <Input
                id={sortId}
                name="sort"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                step={1}
                defaultValue={material?.sort ?? 0}
                invalid={Boolean(errors.sort)}
              />
              <FieldError fieldId={sortId}>{errors.sort}</FieldError>
            </Field>

            <Field className="col-span-full">
              <Checkbox id={featuredId} name="featured" defaultChecked={material?.featured ?? false} invalid={Boolean(errors.featured)}>
                {MATERIAL_FORM_TEXTS.featured}
              </Checkbox>
              <FieldError fieldId={featuredId}>{errors.featured}</FieldError>
            </Field>

            <Field className="col-span-full">
              <Checkbox id={activeId} name="active" defaultChecked={material?.active ?? true} invalid={Boolean(errors.active)}>
                {MATERIAL_FORM_TEXTS.active}
              </Checkbox>
              <FieldError fieldId={activeId}>{errors.active}</FieldError>
            </Field>

            <div className="col-span-full">
              <PhotoField
                folder="materials"
                slug={slug}
                currentPath={material?.photo_path ?? null}
                label={MATERIAL_FORM_TEXTS.photo}
                hint={MATERIAL_FORM_TEXTS.photoHint}
                ratio="1:1"
                id={photoId}
                error={errors[PHOTO_FIELDS.path]}
                onUploadingChange={setUploading}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="primary" disabled={held} aria-busy={pending || undefined}>
              {pending ? MATERIAL_FORM_TEXTS.submitting : MATERIAL_FORM_TEXTS.submit}
            </Button>
            <SaveNotice state={state} pending={pending} />
          </div>
        </form>
      </AdminCard>

      {editing && <DeleteMaterialButton id={material.id} name={material.name} />}
    </div>
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
