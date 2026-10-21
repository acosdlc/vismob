"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import {
  canPublish,
  heroAllowed,
  isUuid,
  NIL_UUID,
  parseProjectForm,
  PROJECT_MESSAGES,
  projectSlugFor,
  type ProjectInput,
} from "@/lib/admin/projects";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/leads/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** Where a freshly created project opens, with the „Adăugat.” notice. */
const projectPath = (id: string) => `/admin/lucrari/${id}?creat=1`;

type Outcome = { kind: "created"; id: string } | { kind: "updated" } | { kind: "failed"; state: AdminActionState };

const failed = (state: AdminActionState): Outcome => ({ kind: "failed", state });
const generic = (): Outcome => failed({ status: "error", message: ADMIN_MESSAGES.generic });
const invalid = (fieldErrors: FieldErrors): Outcome => failed({ status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors });

/**
 * „Salvează” on /admin/lucrari/nou and /admin/lucrari/[id], for `useActionState` (PLAN
 * PR-9 „Lucrări”). Re-checks the admin role, validates the whole form, applies the two
 * publication rules (no publishing without the client's consent, no hero unless
 * published), confirms the model, material and base name rows, then writes through the
 * signed-in user's cookie client (RLS: `admin_all`). A new project (hidden `id` empty)
 * gets its slug from the title and lands on its own screen; an existing one keeps its
 * slug whatever the form posts. When the project is flagged `hero`, every other hero
 * flag is cleared first, so at most one project carries it. A successful write expires
 * the "projects" tag, so the site reads the new rows on its next request (ARHITECTURA §8).
 */
export async function saveProject(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const posted = formData.get("id");
  const projectId = typeof posted === "string" ? posted.trim() : "";
  if (projectId !== "" && !isUuid(projectId)) return { status: "error", message: ADMIN_MESSAGES.invalid };

  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };
  const input = parsed.data;

  if (!canPublish(input)) {
    return { status: "error", message: PROJECT_MESSAGES.consent, fieldErrors: { published: PROJECT_MESSAGES.consent } };
  }
  if (!heroAllowed(input)) {
    return { status: "error", message: PROJECT_MESSAGES.heroUnpublished, fieldErrors: { hero: PROJECT_MESSAGES.heroUnpublished } };
  }

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveProject: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let outcome: Outcome;
  try {
    outcome = (await checkReferences(supabase, input)) ?? (projectId === "" ? await createProject(supabase, input) : await updateProject(supabase, projectId, input));
  } catch (err) {
    console.error("saveProject", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }
  if (outcome.kind === "failed") return outcome.state;

  updateTag("projects");
  // redirect() throws to perform the navigation, so it stays outside the try.
  if (outcome.kind === "created") redirect(projectPath(outcome.id));
  // The edit screen re-reads the row in the action's own response: the title and the
  // lead follow the saved values (server-actions.md, refresh).
  refresh();
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}

/** The columns both the insert and the update write; the slug is added by the insert alone. */
function columns(input: ProjectInput) {
  return {
    title: input.title,
    ticket_no: input.ticket_no,
    model_id: input.model_id,
    width_cm: input.width_cm,
    length_cm: input.length_cm,
    material_id: input.material_id,
    base_id: input.base_id,
    extras: input.extras,
    city: input.city,
    delivered_on: input.delivered_on,
    featured: input.featured,
    hero: input.hero,
    published: input.published,
    client_consent: input.client_consent,
    sort: input.sort,
  };
}

/**
 * The model, the material and the base have to name rows (the columns are foreign keys,
 * and projectsFromRows() needs the names). Null when every reference resolves; a failed
 * outcome otherwise, with the error on the field that pointed nowhere.
 */
async function checkReferences(supabase: ServerClient, input: ProjectInput): Promise<Outcome | null> {
  const [models, materials, bases] = await Promise.all([
    supabase.from("models").select("id"),
    input.material_id === null ? null : supabase.from("materials").select("id"),
    input.base_id === null ? null : supabase.from("bases").select("id"),
  ]);
  if (models.error) {
    console.error(`saveProject: models: ${models.error.message}`);
    return generic();
  }
  if (materials?.error) {
    console.error(`saveProject: materials: ${materials.error.message}`);
    return generic();
  }
  if (bases?.error) {
    console.error(`saveProject: bases: ${bases.error.message}`);
    return generic();
  }

  const fieldErrors: FieldErrors = {};
  if (!models.data.some((row) => row.id === input.model_id)) fieldErrors.model_id = ADMIN_MESSAGES.invalid;
  if (materials && !materials.data.some((row) => row.id === input.material_id)) fieldErrors.material_id = ADMIN_MESSAGES.invalid;
  if (bases && !bases.data.some((row) => row.id === input.base_id)) fieldErrors.base_id = ADMIN_MESSAGES.invalid;
  return Object.keys(fieldErrors).length > 0 ? invalid(fieldErrors) : null;
}

/**
 * Hero exclusivity (PLAN PR-9: „hero (only one project at a time)”): before the write,
 * every other project drops the flag. For a new project nothing is excluded yet, so the
 * `neq` names the nil uuid, which no row carries.
 */
async function clearOtherHeroes(supabase: ServerClient, exceptId: string): Promise<Outcome | null> {
  const { error } = await supabase.from("projects").update({ hero: false }).eq("hero", true).neq("id", exceptId).select("id");
  if (error) {
    console.error(`saveProject: clearing hero: ${error.message}`);
    return generic();
  }
  return null;
}

async function createProject(supabase: ServerClient, input: ProjectInput): Promise<Outcome> {
  const existing = await supabase.from("projects").select("slug");
  if (existing.error) {
    console.error(`saveProject: projects: ${existing.error.message}`);
    return generic();
  }
  const slug = projectSlugFor(
    input.title,
    existing.data.map((row) => row.slug),
  );
  if (!slug.ok) return invalid({ title: slug.message });

  if (input.hero) {
    const cleared = await clearOtherHeroes(supabase, NIL_UUID);
    if (cleared) return cleared;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({ slug: slug.slug, ...columns(input) })
    .select("id");
  if (error) {
    console.error(`saveProject: insert: ${error.message}`);
    return generic();
  }
  // RLS does not refuse an insert it filters out: without the admin role the statement
  // writes 0 rows and comes back without an error.
  if (!data || data.length !== 1) return failed({ status: "error", message: ADMIN_MESSAGES.forbidden });
  return { kind: "created", id: data[0].id };
}

async function updateProject(supabase: ServerClient, id: string, input: ProjectInput): Promise<Outcome> {
  const row = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (row.error) {
    console.error(`saveProject: projects ${id}: ${row.error.message}`);
    return generic();
  }
  if (!row.data) return failed({ status: "error", message: ADMIN_MESSAGES.notFound });

  if (input.hero) {
    const cleared = await clearOtherHeroes(supabase, id);
    if (cleared) return cleared;
  }

  // The slug is not in the payload: it never changes after creation.
  const { data, error } = await supabase.from("projects").update(columns(input)).eq("id", id).select("id");
  if (error) {
    console.error(`saveProject: update ${id}: ${error.message}`);
    return generic();
  }
  // RLS filters silently: 0 rows means no admin role (the row was just read, so it exists).
  if (!data || data.length !== 1) return failed({ status: "error", message: ADMIN_MESSAGES.forbidden });
  return { kind: "updated" };
}
