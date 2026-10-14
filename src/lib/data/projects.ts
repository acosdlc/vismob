import type { ModelId } from "@/lib/configurator/types";
import { SEED_PROJECTS, type Project } from "./projects.seed";

export type { Project, ProjectPhoto } from "./projects.seed";
export { projectCaption } from "./projects.seed";

export interface ProjectsFilter {
  /** Only the projects shown on Acasă 05. */
  featured?: boolean;
  /** The `/lucrari?model=` filter (DESIGN §4.4). */
  model?: ModelId;
}

// PR-5 switches these to cached Supabase reads (published projects with the
// client's consent) with the seed as the fallback for builds that have no
// environment variables.
export async function getProjects(filter: ProjectsFilter = {}): Promise<Project[]> {
  return SEED_PROJECTS.filter(
    (p) =>
      (filter.featured === undefined || p.featured === filter.featured) &&
      (filter.model === undefined || p.modelId === filter.model),
  );
}

/** The project flagged `hero`, or null: the hero ticket then hides (docs/PLAN.md). */
export async function getHeroProject(): Promise<Project | null> {
  return SEED_PROJECTS.find((p) => p.hero) ?? null;
}
