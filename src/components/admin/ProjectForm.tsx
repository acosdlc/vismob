"use client";

import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent } from "react";
import { saveProject } from "@/actions/admin/save-project";
import { DeleteProjectButton } from "@/components/admin/DeleteProjectButton";
import { AdminCard, AdminSection, Notice, fieldGridClasses } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Checkbox, Field, FieldError, Input, Label, Select, fieldErrorId } from "@/components/site/form";
import { focusFirstInvalid } from "@/components/site/form/helpers";
import { EXTRAS, extrasValues, PROJECT_LIMITS, PROJECT_SIZE } from "@/lib/admin/projects";
import { ADMIN_INITIAL_STATE, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";
import type { Tables } from "@/lib/supabase/database.types";

/** The row the form edits; null for a new project. */
export type ProjectFormProject = Pick<
  Tables<"projects">,
  | "id"
  | "title"
  | "ticket_no"
  | "model_id"
  | "width_cm"
  | "length_cm"
  | "material_id"
  | "base_id"
  | "extras"
  | "city"
  | "delivered_on"
  | "featured"
  | "hero"
  | "published"
  | "client_consent"
  | "sort"
>;

export type ProjectFormModel = Pick<Tables<"models">, "id" | "name">;
export type ProjectFormMaterial = Pick<Tables<"materials">, "id" | "name" | "family_id">;
export type ProjectFormFamily = Pick<Tables<"material_families">, "id" | "name">;
export type ProjectFormBase = Pick<Tables<"bases">, "id" | "name">;

export interface ProjectFormProps {
  project: ProjectFormProject | null;
  /** The selects' options, in catalogue order; inactive rows included (a project may reference one). */
  models: ProjectFormModel[];
  materials: ProjectFormMaterial[];
  families: ProjectFormFamily[];
  bases: ProjectFormBase[];
}

export const PROJECT_FORM_TEXTS = {
  sectionProject: "Proiectul",
  sectionPublish: "Publicare",
  title: "Titlu",
  titleHint: "Numele proiectului, de exemplu „Pat capitonat pentru un dormitor mic”. Apare și ca text alternativ al pozei.",
  ticketNo: "Nr. fișă",
  ticketNoHint: "Apare pe fișa din hero ca „Nr. …”.",
  model: "Model",
  width: "Lățime saltea (cm)",
  length: "Lungime saltea (cm)",
  material: "Material",
  base: "Bază",
  extras: "Extra",
  city: "Oraș",
  deliveredOn: "Livrat în",
  deliveredOnHint: "Apare ca „Livrat Oraș, lună an”.",
  clientConsent: "Clientul a fost de acord cu publicarea pozelor și a datelor (obligatoriu pentru publicare)",
  published: "Publicat (apare pe site)",
  featured: "Apare pe Acasă (galeria de 6)",
  hero: "Proiectul din hero (poza mare de pe Acasă, cu fișa); un singur proiect poate fi",
  sort: "Ordine",
  /** The empty option of the material and base selects. */
  none: "—",
  submit: "Salvează",
  submitting: "Se salvează…",
} as const;

/** The focus goes to the first invalid field in form order (DESIGN §3.16). */
const FIELD_ORDER: readonly string[] = [
  "title",
  "ticket_no",
  "model_id",
  "width_cm",
  "length_cm",
  "material_id",
  "base_id",
  "extras",
  "city",
  "delivered_on",
  "client_consent",
  "published",
  "featured",
  "hero",
  "sort",
];

const HINT = "text-[14px] leading-[1.4] text-muted";

// PLAN PR-9 „Lucrări”, DESIGN §4.8: two cards over every editable column of a project,
// the project itself and its publication. `useActionState` drives the `saveProject`
// Server Action; the submit goes through `onSubmit` so the typed values stay in place
// after a save (React resets a form it submitted itself). A new project posts an empty
// hidden `id` and lands on its own screen (the action redirects); an existing one keeps
// its slug. The photos have their own form (ProjectPhotosForm), once the row exists.
// Without JavaScript the `<form action>` posts to the action. No client pre-pass: the
// admin reads the server's field errors, including the two publication rules.
export function ProjectForm({ project, models, materials, families, bases }: ProjectFormProps) {
  const [state, formAction, pending] = useActionState(saveProject, ADMIN_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const errors: FieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const editing = project !== null;
  const ticked = extrasValues(project?.extras ?? []);

  useEffect(() => {
    if (state.status === "error" && state.fieldErrors && formRef.current) {
      focusFirstInvalid(formRef.current, state.fieldErrors, FIELD_ORDER);
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const ids = {
    title: `${id}-title`,
    titleHint: `${id}-title-hint`,
    ticketNo: `${id}-ticket`,
    ticketNoHint: `${id}-ticket-hint`,
    model: `${id}-model`,
    width: `${id}-width`,
    length: `${id}-length`,
    material: `${id}-material`,
    base: `${id}-base`,
    extras: `${id}-extras`,
    city: `${id}-city`,
    deliveredOn: `${id}-delivered`,
    deliveredOnHint: `${id}-delivered-hint`,
    clientConsent: `${id}-consent`,
    published: `${id}-published`,
    featured: `${id}-featured`,
    hero: `${id}-hero`,
    sort: `${id}-sort`,
  };
  const extrasInvalid = Boolean(errors.extras);

  return (
    <div className="flex flex-col gap-8">
      <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-8">
        <input type="hidden" name="id" value={project?.id ?? ""} />

        <AdminSection title={PROJECT_FORM_TEXTS.sectionProject}>
          <AdminCard>
            <div className={fieldGridClasses}>
              <Field>
                <Label htmlFor={ids.title}>{PROJECT_FORM_TEXTS.title}</Label>
                <Input
                  id={ids.title}
                  name="title"
                  type="text"
                  defaultValue={project?.title ?? ""}
                  maxLength={PROJECT_LIMITS.title}
                  invalid={Boolean(errors.title)}
                  aria-describedby={ids.titleHint}
                />
                <p id={ids.titleHint} className={HINT}>
                  {PROJECT_FORM_TEXTS.titleHint}
                </p>
                <FieldError fieldId={ids.title}>{errors.title}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.ticketNo}>{PROJECT_FORM_TEXTS.ticketNo}</Label>
                <Input
                  id={ids.ticketNo}
                  name="ticket_no"
                  type="text"
                  defaultValue={project?.ticket_no ?? ""}
                  maxLength={PROJECT_LIMITS.ticketNo}
                  invalid={Boolean(errors.ticket_no)}
                  aria-describedby={ids.ticketNoHint}
                  className="font-mono"
                />
                <p id={ids.ticketNoHint} className={HINT}>
                  {PROJECT_FORM_TEXTS.ticketNoHint}
                </p>
                <FieldError fieldId={ids.ticketNo}>{errors.ticket_no}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.model}>{PROJECT_FORM_TEXTS.model}</Label>
                <Select id={ids.model} name="model_id" defaultValue={project?.model_id ?? models[0]?.id ?? ""} invalid={Boolean(errors.model_id)}>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </Select>
                <FieldError fieldId={ids.model}>{errors.model_id}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.width}>{PROJECT_FORM_TEXTS.width}</Label>
                <Input
                  id={ids.width}
                  name="width_cm"
                  type="number"
                  inputMode="numeric"
                  min={PROJECT_SIZE.min}
                  max={PROJECT_SIZE.max}
                  step={1}
                  defaultValue={project?.width_cm ?? ""}
                  invalid={Boolean(errors.width_cm)}
                />
                <FieldError fieldId={ids.width}>{errors.width_cm}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.length}>{PROJECT_FORM_TEXTS.length}</Label>
                <Input
                  id={ids.length}
                  name="length_cm"
                  type="number"
                  inputMode="numeric"
                  min={PROJECT_SIZE.min}
                  max={PROJECT_SIZE.max}
                  step={1}
                  defaultValue={project?.length_cm ?? ""}
                  invalid={Boolean(errors.length_cm)}
                />
                <FieldError fieldId={ids.length}>{errors.length_cm}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.material}>{PROJECT_FORM_TEXTS.material}</Label>
                <Select id={ids.material} name="material_id" defaultValue={project?.material_id ?? ""} invalid={Boolean(errors.material_id)}>
                  <option value="">{PROJECT_FORM_TEXTS.none}</option>
                  {families.map((family) => {
                    const colours = materials.filter((material) => material.family_id === family.id);
                    if (colours.length === 0) return null;
                    return (
                      <optgroup key={family.id} label={family.name}>
                        {colours.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
                <FieldError fieldId={ids.material}>{errors.material_id}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.base}>{PROJECT_FORM_TEXTS.base}</Label>
                <Select id={ids.base} name="base_id" defaultValue={project?.base_id ?? ""} invalid={Boolean(errors.base_id)}>
                  <option value="">{PROJECT_FORM_TEXTS.none}</option>
                  {bases.map((base) => (
                    <option key={base.id} value={base.id}>
                      {base.name}
                    </option>
                  ))}
                </Select>
                <FieldError fieldId={ids.base}>{errors.base_id}</FieldError>
              </Field>

              <fieldset className="flex min-w-0 flex-col gap-[6px]">
                <legend className="text-[14px] leading-[1.4] font-semibold text-ink">{PROJECT_FORM_TEXTS.extras}</legend>
                <div className="flex flex-col">
                  {EXTRAS.map((extra, index) => (
                    <Checkbox
                      key={extra.value}
                      id={`${ids.extras}-${extra.value}`}
                      name="extras"
                      value={extra.value}
                      defaultChecked={ticked.includes(extra.value)}
                      aria-invalid={extrasInvalid || undefined}
                      aria-describedby={extrasInvalid ? fieldErrorId(ids.extras) : undefined}
                      data-field={index === 0 ? "extras" : undefined}
                    >
                      {extra.label}
                    </Checkbox>
                  ))}
                </div>
                <FieldError fieldId={ids.extras}>{errors.extras}</FieldError>
              </fieldset>

              <Field>
                <Label htmlFor={ids.city}>{PROJECT_FORM_TEXTS.city}</Label>
                <Input
                  id={ids.city}
                  name="city"
                  type="text"
                  defaultValue={project?.city ?? ""}
                  maxLength={PROJECT_LIMITS.city}
                  invalid={Boolean(errors.city)}
                />
                <FieldError fieldId={ids.city}>{errors.city}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.deliveredOn}>{PROJECT_FORM_TEXTS.deliveredOn}</Label>
                <Input
                  id={ids.deliveredOn}
                  name="delivered_on"
                  type="date"
                  defaultValue={project?.delivered_on ?? ""}
                  invalid={Boolean(errors.delivered_on)}
                  aria-describedby={ids.deliveredOnHint}
                />
                <p id={ids.deliveredOnHint} className={HINT}>
                  {PROJECT_FORM_TEXTS.deliveredOnHint}
                </p>
                <FieldError fieldId={ids.deliveredOn}>{errors.delivered_on}</FieldError>
              </Field>
            </div>
          </AdminCard>
        </AdminSection>

        <AdminSection title={PROJECT_FORM_TEXTS.sectionPublish}>
          <AdminCard>
            <div className={fieldGridClasses}>
              <Field className="col-span-full">
                <Checkbox
                  id={ids.clientConsent}
                  name="client_consent"
                  defaultChecked={project?.client_consent ?? false}
                  invalid={Boolean(errors.client_consent)}
                >
                  {PROJECT_FORM_TEXTS.clientConsent}
                </Checkbox>
                <FieldError fieldId={ids.clientConsent}>{errors.client_consent}</FieldError>
              </Field>

              <Field className="col-span-full">
                <Checkbox id={ids.published} name="published" defaultChecked={project?.published ?? false} invalid={Boolean(errors.published)}>
                  {PROJECT_FORM_TEXTS.published}
                </Checkbox>
                <FieldError fieldId={ids.published}>{errors.published}</FieldError>
              </Field>

              <Field className="col-span-full">
                <Checkbox id={ids.featured} name="featured" defaultChecked={project?.featured ?? false} invalid={Boolean(errors.featured)}>
                  {PROJECT_FORM_TEXTS.featured}
                </Checkbox>
                <FieldError fieldId={ids.featured}>{errors.featured}</FieldError>
              </Field>

              <Field className="col-span-full">
                <Checkbox id={ids.hero} name="hero" defaultChecked={project?.hero ?? false} invalid={Boolean(errors.hero)}>
                  {PROJECT_FORM_TEXTS.hero}
                </Checkbox>
                <FieldError fieldId={ids.hero}>{errors.hero}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={ids.sort}>{PROJECT_FORM_TEXTS.sort}</Label>
                <Input
                  id={ids.sort}
                  name="sort"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={PROJECT_LIMITS.sort}
                  step={1}
                  defaultValue={project?.sort ?? 0}
                  invalid={Boolean(errors.sort)}
                />
                <FieldError fieldId={ids.sort}>{errors.sort}</FieldError>
              </Field>
            </div>
          </AdminCard>
        </AdminSection>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
            {pending ? PROJECT_FORM_TEXTS.submitting : PROJECT_FORM_TEXTS.submit}
          </Button>
          <SaveNotice state={state} pending={pending} />
        </div>
      </form>

      {editing && <DeleteProjectButton id={project.id} title={project.title} />}
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
