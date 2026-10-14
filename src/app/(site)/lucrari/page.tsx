import type { Metadata } from "next";
import { Suspense } from "react";
import { ModelFilter, parseModelParam } from "@/components/lucrari/ModelFilter";
import { ProjectGrid } from "@/components/lucrari/ProjectGrid";
import { PageHeader } from "@/components/site/PageHeader";
import type { Model } from "@/lib/configurator/types";
import { getCatalog } from "@/lib/data/catalog";
import { getProjects } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Lucrări" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// DESIGN §4.4. `searchParams` is request-time data: only the filter and the grid await
// it, inside <Suspense>, so the header and the pill row stay in the prerendered shell.
export default async function LucrariPage({ searchParams }: { searchParams: SearchParams }) {
  const catalog = await getCatalog();
  return (
    <div className="container-site pb-[clamp(64px,8vw,112px)]">
      <PageHeader
        title="Lucrări"
        lead="Proiecte reale, fotografiate la clienți acasă, cu dimensiunile și materialele folosite."
      />
      <Suspense fallback={<ModelFilter models={catalog.models} />}>
        <FilteredProjects searchParams={searchParams} models={catalog.models} />
      </Suspense>
    </div>
  );
}

async function FilteredProjects({ searchParams, models }: { searchParams: SearchParams; models: Model[] }) {
  const model = parseModelParam((await searchParams).model, models);
  const projects = await getProjects(model ? { model } : {});
  return (
    <div className="flex flex-col gap-[clamp(24px,3vw,40px)]">
      <ModelFilter models={models} active={model} />
      <ProjectGrid projects={projects} />
    </div>
  );
}
