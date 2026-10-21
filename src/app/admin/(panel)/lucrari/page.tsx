import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { AdminPage, EmptyState, Notice, Table, TableWrap, Tag, Td, Th } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { deliveredLabel } from "@/lib/data/projects";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lucrări" };

/** Shown in place of the table when a query fails. */
const READ_FAILED = "Nu am putut citi proiectele. Reîncarcă pagina.";

/** The query-string flag the delete redirects here with. */
const DELETED_FLAG = "sters";

const LINK = "inline-flex min-h-11 items-center underline hover:text-accent";

type ProjectRow = Pick<
  Tables<"projects">,
  "id" | "slug" | "title" | "model_id" | "width_cm" | "length_cm" | "city" | "delivered_on" | "featured" | "hero" | "published" | "client_consent" | "sort"
>;
type ModelRow = Pick<Tables<"models">, "id" | "name">;

interface ProjectsRows {
  projects: ProjectRow[];
  /** Photos per project id. */
  photoCounts: Map<string, number>;
  models: ModelRow[];
}

type ProjectsRead = { ok: true; rows: ProjectsRows } | { ok: false; problem: string };

// PLAN PR-9 „Lucrări”: the overview of the delivered projects, read through the
// signed-in user's cookie client (ARHITECTURA §8), so unpublished rows show too. Each
// title links to its edit screen, where the photos are managed. The (panel) layout
// wraps this page in the guard's <Suspense>, so searchParams and cookies() may be read
// at the top level.
export default async function LucrariPage({ searchParams }: PageProps<"/admin/lucrari">) {
  const sp = await searchParams;
  const deleted = sp[DELETED_FLAG] === "1";
  const read = await readProjects();

  return (
    <AdminPage
      title="Lucrări"
      lead="Proiectele livrate, cu pozele lor. Pe site apar doar cele publicate și cu acordul clientului."
      actions={<Button href="/admin/lucrari/nou">Adaugă proiect</Button>}
    >
      {deleted && <Notice tone="ok">{ADMIN_MESSAGES.removed}</Notice>}
      {read.ok ? <ProjectsTable rows={read.rows} /> : <Notice tone="error">{read.problem}</Notice>}
    </AdminPage>
  );
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }, table: string): T[] {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

async function readProjects(): Promise<ProjectsRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("LucrariPage: createClient", err);
    return { ok: false, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const [projects, photos, models] = await Promise.all([
      supabase
        .from("projects")
        .select("id, slug, title, model_id, width_cm, length_cm, city, delivered_on, featured, hero, published, client_consent, sort")
        .order("sort")
        .order("slug"),
      supabase.from("project_photos").select("project_id"),
      supabase.from("models").select("id, name"),
    ]);
    const photoCounts = new Map<string, number>();
    for (const photo of unwrap(photos, "project_photos")) {
      photoCounts.set(photo.project_id, (photoCounts.get(photo.project_id) ?? 0) + 1);
    }
    return { ok: true, rows: { projects: unwrap(projects, "projects"), photoCounts, models: unwrap(models, "models") } };
  } catch (err) {
    unstable_rethrow(err);
    console.error("LucrariPage: projects", err);
    return { ok: false, problem: READ_FAILED };
  }
}

function ProjectsTable({ rows }: { rows: ProjectsRows }) {
  if (rows.projects.length === 0) return <EmptyState>Niciun proiect încă. Adaugă primul.</EmptyState>;
  const modelName = new Map(rows.models.map((model) => [model.id, model.name]));
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Titlu</Th>
            <Th>Model</Th>
            <Th>Saltea</Th>
            <Th>Oraș</Th>
            <Th>Livrat</Th>
            <Th>Poze</Th>
            <Th>Stare</Th>
            <Th>Ordine</Th>
          </tr>
        </thead>
        <tbody>
          {rows.projects.map((project) => (
            <tr key={project.id} className="[&>td]:align-middle">
              <Td>
                <Link href={`/admin/lucrari/${project.id}`} className={`${LINK} font-semibold`}>
                  {project.title}
                </Link>
              </Td>
              <Td>{(project.model_id && modelName.get(project.model_id)) || project.model_id || "—"}</Td>
              <Td className="mono-13 whitespace-nowrap">
                {project.width_cm !== null && project.length_cm !== null ? `${project.width_cm} × ${project.length_cm}` : "—"}
              </Td>
              <Td>{project.city || "—"}</Td>
              <Td className="whitespace-nowrap">{deliveredLabel("", project.delivered_on) || project.delivered_on || "—"}</Td>
              <Td className="mono-13">{rows.photoCounts.get(project.id) ?? 0}</Td>
              <Td>
                <span className="flex flex-wrap gap-2">
                  <Tag tone={project.published ? "accent" : "muted"}>{project.published ? "Publicat" : "Nepublicat"}</Tag>
                  {project.featured && <Tag tone="accent">Acasă</Tag>}
                  {project.hero && <Tag>Hero</Tag>}
                  {!project.client_consent && <Tag tone="muted">Fără acord</Tag>}
                </span>
              </Td>
              <Td className="mono-13">{project.sort}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
