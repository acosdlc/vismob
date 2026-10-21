import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import {
  ProjectForm,
  type ProjectFormBase,
  type ProjectFormFamily,
  type ProjectFormMaterial,
  type ProjectFormModel,
  type ProjectFormProject,
} from "@/components/admin/ProjectForm";
import { PROJECT_PHOTOS_TEXTS, ProjectPhotosForm, type ProjectPhotosFormPhoto } from "@/components/admin/ProjectPhotosForm";
import { AdminPage, AdminSection, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { isUuid } from "@/lib/admin/projects";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Proiect" };

/** Shown over the screen when the project cannot be read. */
const READ_FAILED = "Nu am putut citi proiectele. Reîncarcă pagina.";

/** The query-string flag saveProject redirects here with after a create. */
const CREATED_FLAG = "creat";

/** The columns the form edits. */
const PROJECT_COLUMNS =
  "id, title, ticket_no, model_id, width_cm, length_cm, material_id, base_id, extras, city, delivered_on, featured, hero, published, client_consent, sort";

interface ProjectLists {
  models: ProjectFormModel[];
  materials: ProjectFormMaterial[];
  families: ProjectFormFamily[];
  bases: ProjectFormBase[];
}

type ProjectRead =
  | { kind: "found"; project: ProjectFormProject; photos: ProjectPhotosFormPhoto[]; lists: ProjectLists }
  | { kind: "missing" }
  | { kind: "failed"; problem: string };

// PLAN PR-9 „Lucrări”, the edit screen: the row, its photos and the selects' options
// through the signed-in user's cookie client (ARHITECTURA §8), so an unpublished project
// opens too. The photos have their own form under the project's, since they need the row
// to exist. The (panel) layout's <Suspense> guard lets params, searchParams and cookies()
// be read at the top level.
export default async function ProiectPage({ params, searchParams }: PageProps<"/admin/lucrari/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  const read = await readProject(id);
  if (read.kind === "missing") notFound();
  if (read.kind === "failed") {
    return (
      <AdminPage title="Proiect">
        <Notice tone="error">{read.problem}</Notice>
      </AdminPage>
    );
  }

  const { project, photos, lists } = read;
  const modelName = (project.model_id && lists.models.find((model) => model.id === project.model_id)?.name) || project.model_id || "";
  const size = project.width_cm !== null && project.length_cm !== null ? `${project.width_cm} × ${project.length_cm} cm` : "";
  const lead = [modelName, size].filter(Boolean).join(" · ");

  return (
    <AdminPage
      title={project.title}
      lead={lead || undefined}
      actions={
        <Button variant="link" href="/admin/lucrari">
          Înapoi la lucrări
        </Button>
      }
    >
      {sp[CREATED_FLAG] === "1" && <Notice tone="ok">{ADMIN_MESSAGES.created}</Notice>}
      <ProjectForm project={project} {...lists} />
      <AdminSection title="Poze" description={PROJECT_PHOTOS_TEXTS.sectionHint}>
        <ProjectPhotosForm projectId={project.id} photos={photos} />
      </AdminSection>
    </AdminPage>
  );
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }, table: string): T[] {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

async function readProject(id: string): Promise<ProjectRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("ProiectPage: createClient", err);
    return { kind: "failed", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const [project, photos, models, materials, families, bases] = await Promise.all([
      supabase.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle(),
      supabase.from("project_photos").select("id, path, alt, sort").eq("project_id", id).order("sort").order("path"),
      supabase.from("models").select("id, name").order("sort").order("id"),
      supabase.from("materials").select("id, name, family_id").order("sort").order("id"),
      supabase.from("material_families").select("id, name").order("sort").order("id"),
      supabase.from("bases").select("id, name").order("sort").order("id"),
    ]);
    if (project.error) throw new Error(`projects: ${project.error.message}`);
    if (!project.data) return { kind: "missing" };
    return {
      kind: "found",
      project: project.data,
      photos: unwrap(photos, "project_photos"),
      lists: {
        models: unwrap(models, "models"),
        materials: unwrap(materials, "materials"),
        families: unwrap(families, "material_families"),
        bases: unwrap(bases, "bases"),
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    console.error(`ProiectPage: project ${id}`, err);
    return { kind: "failed", problem: READ_FAILED };
  }
}
