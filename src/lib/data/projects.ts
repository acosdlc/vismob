import { cacheLife, cacheTag } from "next/cache";
import type { ModelId } from "@/lib/configurator/types";
import type { Tables } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { isModelId } from "./catalog";
import { failedRead } from "./fallback";
import { mediaUrl } from "./media";
import { SEED_PROJECTS, type Project } from "./projects.seed";

export type { Project, ProjectPhoto } from "./projects.seed";
export { projectCaption } from "./projects.seed";

export interface ProjectsFilter {
  /** Only the projects shown on Acasă 05. */
  featured?: boolean;
  /** The `/lucrari?model=` filter (DESIGN §4.4). */
  model?: ModelId;
}

// The columns each select reads. The public_read policies hide unpublished
// projects (and their photos) and inactive materials and bases, so there is no
// `published` or `active` check in code.
export type ProjectRow = Pick<
  Tables<"projects">,
  | "id"
  | "slug"
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
  | "sort"
>;
export type ProjectPhotoRow = Pick<Tables<"project_photos">, "project_id" | "path" | "alt" | "sort">;

export interface ProjectRows {
  projects: ProjectRow[];
  photos: ProjectPhotoRow[];
  materials: Pick<Tables<"materials">, "id" | "name" | "family_id">[];
  families: Pick<Tables<"material_families">, "id" | "name">[];
  bases: Pick<Tables<"bases">, "id" | "name">[];
}

const MONTHS = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

/** „Cluj-Napoca, martie 2026” from `delivered_on` (an ISO date); "" without a date. */
export function deliveredLabel(city: string, deliveredOn: string | null): string {
  const match = deliveredOn ? /^(\d{4})-(\d{2})/.exec(deliveredOn) : null;
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return "";
  return [city, `${month} ${match[1]}`].filter(Boolean).join(", ");
}

/**
 * `projects` + `project_photos` + the names they reference as Project[], ordered by
 * `sort` then slug. Pure. A row the site cannot show (a model it does not know, no
 * dimensions) is skipped with a console.error. Labels the workshop left empty stay
 * "" and the components hide them.
 */
export function projectsFromRows(rows: ProjectRows): Project[] {
  const familyName = new Map(rows.families.map((f) => [f.id, f.name]));
  const materials = new Map(rows.materials.map((m) => [m.id, m]));
  const baseName = new Map(rows.bases.map((b) => [b.id, b.name]));
  const photos = [...rows.photos].sort((a, b) => a.sort - b.sort || a.path.localeCompare(b.path));

  const projects: Project[] = [];
  for (const row of [...rows.projects].sort((a, b) => a.sort - b.sort || a.slug.localeCompare(b.slug))) {
    if (!isModelId(row.model_id)) {
      console.error(`projects: "${row.slug}" has model "${row.model_id}", which the site does not know; skipped.`);
      continue;
    }
    if (row.width_cm === null || row.length_cm === null) {
      console.error(`projects: "${row.slug}" has no mattress size; skipped.`);
      continue;
    }

    // „Catifea, verde sticlă” (DESIGN §3.6): the family's name, then the colour in lower case.
    const material = row.material_id ? materials.get(row.material_id) : undefined;
    const family = material ? familyName.get(material.family_id) : undefined;
    const materialLabel = material && family ? `${family}, ${material.name.toLowerCase()}` : "";
    const city = row.city ?? "";
    const photo = photos.find((p) => p.project_id === row.id);

    projects.push({
      slug: row.slug,
      ticketNo: row.ticket_no ?? "",
      title: row.title,
      modelId: row.model_id,
      widthCm: row.width_cm,
      lengthCm: row.length_cm,
      materialLabel,
      baseLabel: (row.base_id && baseName.get(row.base_id)) || "",
      extras: [...row.extras],
      city,
      deliveredLabel: deliveredLabel(city, row.delivered_on),
      // An empty alt in the table means "none given": the components then fall back to the title.
      photo: photo ? { src: mediaUrl(photo.path), alt: photo.alt || undefined, label: "", frame: "" } : undefined,
      featured: row.featured,
      hero: row.hero,
    });
  }
  return projects;
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }, table: string): T[] {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

// Null when Supabase cannot be reached (missing env, request or API error): the
// caller then serves the seed. An empty list from a reachable database is the
// truth (no published projects yet). In production it throws instead (fallback.ts).
async function readProjects(): Promise<Project[] | null> {
  try {
    const db = createPublicClient();
    const [projects, photos, materials, families, bases] = await Promise.all([
      db
        .from("projects")
        .select(
          "id, slug, title, ticket_no, model_id, width_cm, length_cm, material_id, base_id, extras, city, delivered_on, featured, hero, sort",
        )
        .order("sort"),
      db.from("project_photos").select("project_id, path, alt, sort").order("sort"),
      db.from("materials").select("id, name, family_id"),
      db.from("material_families").select("id, name"),
      db.from("bases").select("id, name"),
    ]);
    return projectsFromRows({
      projects: unwrap(projects, "projects"),
      photos: unwrap(photos, "project_photos"),
      materials: unwrap(materials, "materials"),
      families: unwrap(families, "material_families"),
      bases: unwrap(bases, "bases"),
    });
  } catch (err) {
    return failedRead("getProjects", err);
  }
}

/** Every published project, cached under the "projects" tag (revalidated by /api/revalidate). */
export async function allProjects(): Promise<Project[]> {
  "use cache";
  cacheTag("projects");
  const projects = await readProjects();
  // A successful read lives a day; the seed fallback only minutes, so an outage is
  // retried soon instead of leaving the FOTO placeholders on the site for a day.
  // Only one cacheLife call runs per invocation (docs: conditional cache lifetimes).
  if (projects) cacheLife("days");
  else cacheLife("minutes");
  return projects ?? SEED_PROJECTS;
}

export async function getProjects(filter: ProjectsFilter = {}): Promise<Project[]> {
  return (await allProjects()).filter(
    (p) =>
      (filter.featured === undefined || p.featured === filter.featured) &&
      (filter.model === undefined || p.modelId === filter.model),
  );
}

/** The project flagged `hero`, or null: the hero ticket then hides (docs/PLAN.md). */
export async function getHeroProject(): Promise<Project | null> {
  return (await allProjects()).find((p) => p.hero) ?? null;
}
