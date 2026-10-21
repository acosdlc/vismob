import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ActiveTag, AdminPage, AdminSection, EmptyState, Notice, Table, TableWrap, Tag, Td, Th } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { mediaUrl } from "@/lib/data/media";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Catalog" };

/** Shown in place of the tables when a query fails. */
const READ_FAILED = "Nu am putut citi catalogul. Reîncarcă pagina.";

/** The query-string flag the delete redirects here with. */
const DELETED_FLAG = "sters";

const LINK = "inline-flex min-h-11 items-center underline hover:text-accent";

type ModelRow = Pick<Tables<"models">, "id" | "name" | "code" | "sort" | "active">;
type FamilyRow = Pick<Tables<"material_families">, "id" | "name" | "code" | "tab" | "sort">;
type MaterialRow = Pick<
  Tables<"materials">,
  "id" | "family_id" | "name" | "code" | "hex" | "supplier" | "supplier_code" | "price_category" | "photo_path" | "featured" | "active" | "sort"
>;
type ModelFamilyRow = Pick<Tables<"model_families">, "model_id" | "family_id">;
type BaseRow = Pick<Tables<"bases">, "id" | "name" | "code" | "photo_path" | "sort" | "active">;

interface CatalogRows {
  models: ModelRow[];
  families: FamilyRow[];
  materials: MaterialRow[];
  modelFamilies: ModelFamilyRow[];
  bases: BaseRow[];
}

type CatalogRead = { ok: true; rows: CatalogRows } | { ok: false; problem: string };

/** The /materiale tab a family sits under (DESIGN §4.3). */
const TAB_LABELS: Record<string, string> = { textile: "Textile", lemn: "Lemn masiv" };

// PLAN PR-8 „Catalog”: the overview of the configurator's content, read through the
// signed-in user's cookie client (ARHITECTURA §8), so inactive rows show too. Models,
// families and bases link to their edit screens (another part of PR-8); materials to
// theirs, and the one thing that can be added from here is a material. The (panel)
// layout wraps this page in the guard's <Suspense>, so searchParams and cookies() may
// be read at the top level.
export default async function CatalogPage({ searchParams }: PageProps<"/admin/catalog">) {
  const sp = await searchParams;
  const deleted = sp[DELETED_FLAG] === "1";
  const read = await readCatalog();

  return (
    <AdminPage
      title="Catalog"
      lead="Modelele, materialele și bazele din configurator. Modelele, familiile și bazele nu se adaugă de aici: fiecare are desene și reguli în cod."
      actions={<Button href="/admin/catalog/materiale/nou">Adaugă material</Button>}
    >
      {deleted && <Notice tone="ok">{ADMIN_MESSAGES.removed}</Notice>}
      {read.ok ? (
        <>
          <ModelsSection models={read.rows.models} families={read.rows.families} modelFamilies={read.rows.modelFamilies} />
          <FamiliesSection families={read.rows.families} materials={read.rows.materials} />
          <MaterialsSection families={read.rows.families} materials={read.rows.materials} />
          <BasesSection bases={read.rows.bases} />
        </>
      ) : (
        <Notice tone="error">{read.problem}</Notice>
      )}
    </AdminPage>
  );
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }, table: string): T[] {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

async function readCatalog(): Promise<CatalogRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("CatalogPage: createClient", err);
    return { ok: false, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const [models, families, materials, modelFamilies, bases] = await Promise.all([
      supabase.from("models").select("id, name, code, sort, active").order("sort").order("id"),
      supabase.from("material_families").select("id, name, code, tab, sort").order("sort").order("id"),
      supabase
        .from("materials")
        .select("id, family_id, name, code, hex, supplier, supplier_code, price_category, photo_path, featured, active, sort")
        .order("sort").order("id"),
      supabase.from("model_families").select("model_id, family_id"),
      supabase.from("bases").select("id, name, code, photo_path, sort, active").order("sort").order("id"),
    ]);
    return {
      ok: true,
      rows: {
        models: unwrap(models, "models"),
        families: unwrap(families, "material_families"),
        materials: unwrap(materials, "materials"),
        modelFamilies: unwrap(modelFamilies, "model_families"),
        bases: unwrap(bases, "bases"),
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    console.error("CatalogPage: catalog", err);
    return { ok: false, problem: READ_FAILED };
  }
}

function ModelsSection({ models, families, modelFamilies }: { models: ModelRow[]; families: FamilyRow[]; modelFamilies: ModelFamilyRow[] }) {
  const familyName = new Map(families.map((family) => [family.id, family.name]));
  return (
    <AdminSection title="Modele">
      {models.length === 0 ? (
        <EmptyState>Niciun model în baza de date.</EmptyState>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Nume</Th>
                <Th>Cod</Th>
                <Th>Familii</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const linked = modelFamilies
                  .filter((mf) => mf.model_id === model.id)
                  .map((mf) => familyName.get(mf.family_id) ?? mf.family_id);
                return (
                  <tr key={model.id} className="[&>td]:align-middle">
                    <Td>
                      <Link href={`/admin/catalog/modele/${model.id}`} className={`${LINK} font-semibold`}>
                        {model.name}
                      </Link>
                    </Td>
                    <Td>
                      <Tag>{model.code}</Tag>
                    </Td>
                    <Td>{linked.length > 0 ? linked.join(", ") : "—"}</Td>
                    <Td>
                      <ActiveTag active={model.active} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </AdminSection>
  );
}

function FamiliesSection({ families, materials }: { families: FamilyRow[]; materials: MaterialRow[] }) {
  return (
    <AdminSection title="Familii de materiale">
      {families.length === 0 ? (
        <EmptyState>Nicio familie în baza de date.</EmptyState>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Nume</Th>
                <Th>Cod</Th>
                <Th>Tab</Th>
                <Th>Culori</Th>
              </tr>
            </thead>
            <tbody>
              {families.map((family) => {
                const colours = materials.filter((material) => material.family_id === family.id);
                const active = colours.filter((material) => material.active).length;
                return (
                  <tr key={family.id} className="[&>td]:align-middle">
                    <Td>
                      <Link href={`/admin/catalog/familii/${family.id}`} className={`${LINK} font-semibold`}>
                        {family.name}
                      </Link>
                    </Td>
                    <Td>
                      <Tag>{family.code}</Tag>
                    </Td>
                    <Td>{TAB_LABELS[family.tab] ?? family.tab}</Td>
                    <Td className="mono-13 whitespace-nowrap">
                      {active} active / {colours.length} în total
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </AdminSection>
  );
}

function MaterialsSection({ families, materials }: { families: FamilyRow[]; materials: MaterialRow[] }) {
  return (
    <AdminSection title="Materiale">
      {families.length === 0 ? (
        <EmptyState>Nicio familie în baza de date.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {families.map((family) => (
            <FamilyMaterials key={family.id} family={family} materials={materials.filter((material) => material.family_id === family.id)} />
          ))}
        </div>
      )}
    </AdminSection>
  );
}

function FamilyMaterials({ family, materials }: { family: FamilyRow; materials: MaterialRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold">{family.name}</h3>
      {materials.length === 0 ? (
        <EmptyState>Niciun material în această familie.</EmptyState>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Culoare</Th>
                <Th>Cod</Th>
                <Th>Categorie</Th>
                <Th>Furnizor</Th>
                <Th>Acasă</Th>
                <Th>Status</Th>
                <Th>Ordine</Th>
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.id} className="[&>td]:align-middle">
                  <Td>
                    <span className="flex items-center gap-3">
                      <ColourSquare material={material} />
                      <Link href={`/admin/catalog/materiale/${material.id}`} className={`${LINK} font-semibold`}>
                        {material.name}
                      </Link>
                    </span>
                  </Td>
                  <Td>
                    <Tag>{material.code}</Tag>
                  </Td>
                  <Td>{material.price_category}</Td>
                  <Td>{[material.supplier, material.supplier_code].filter(Boolean).join(" ") || "—"}</Td>
                  <Td>{material.featured ? <Tag tone="accent">Acasă</Tag> : "—"}</Td>
                  <Td>
                    <ActiveTag active={material.active} />
                  </Td>
                  <Td className="mono-13">{material.sort}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}

/** DESIGN §4.8: a 28px square with the photo, or the hex while there is none. */
function ColourSquare({ material }: { material: MaterialRow }) {
  const src = mediaUrl(material.photo_path);
  const classes = "size-7 shrink-0 border border-[rgba(24,25,27,.25)] object-cover";
  if (src) {
    // A thumbnail from the public bucket, shown only to the admin: a plain <img>,
    // next/image's optimisation and remote-pattern check bring nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={28} height={28} loading="lazy" className={classes} />;
  }
  return <span aria-hidden="true" className={classes} style={{ backgroundColor: material.hex }} />;
}

function BasesSection({ bases }: { bases: BaseRow[] }) {
  return (
    <AdminSection title="Picioare și baze">
      {bases.length === 0 ? (
        <EmptyState>Nicio bază în baza de date.</EmptyState>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Nume</Th>
                <Th>Cod</Th>
                <Th>Poză</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {bases.map((base) => (
                <tr key={base.id} className="[&>td]:align-middle">
                  <Td>
                    <Link href={`/admin/catalog/baze/${base.id}`} className={`${LINK} font-semibold`}>
                      {base.name}
                    </Link>
                  </Td>
                  <Td>
                    <Tag>{base.code}</Tag>
                  </Td>
                  <Td>{base.photo_path ? "da" : "—"}</Td>
                  <Td>
                    <ActiveTag active={base.active} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </AdminSection>
  );
}
