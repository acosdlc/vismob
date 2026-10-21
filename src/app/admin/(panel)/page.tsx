import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { AdminPage, AdminSection, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Panou" };

type Counts = { ok: true; fresh: number; total: number } | { ok: false };

// Both counts through the cookie client, under RLS (ARHITECTURA §8). Null on any
// error: the screen says so instead of showing a figure that is not the database's.
async function readCounts(): Promise<Counts> {
  try {
    const supabase = await createClient();
    const [fresh, all] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "nou"),
      supabase.from("leads").select("id", { count: "exact", head: true }),
    ]);
    if (fresh.error) throw new Error(fresh.error.message);
    if (all.error) throw new Error(all.error.message);
    return { ok: true, fresh: fresh.count ?? 0, total: all.count ?? 0 };
  } catch (err) {
    unstable_rethrow(err);
    console.error("admin dashboard: counting leads", err);
    return { ok: false };
  }
}

const PLURAL = new Intl.PluralRules("ro");

/** The noun after a count, with Romanian agreement: 1 cerere, 2 cereri, 20 de cereri. */
function nounFor(count: number, one: string, many: string): string {
  const category = PLURAL.select(count);
  if (category === "one") return one;
  return category === "other" ? `de ${many}` : many;
}

// ARHITECTURA §8, dashboard: the number of new requests. Nothing else is invented.
export default async function DashboardPage() {
  const counts = await readCounts();
  return (
    <AdminPage title="Panou">
      <AdminSection title="Cereri noi">
        {counts.ok ? (
          <div className="flex flex-col gap-5">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="h2-request">{counts.fresh}</span>
              <span className="text-[18px] text-ink-2">{nounFor(counts.fresh, "cerere nouă", "cereri noi")}</span>
            </p>
            <p className="mono-13 text-muted">
              {counts.total} {nounFor(counts.total, "cerere în total", "cereri în total")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button href="/admin/cereri?status=nou" variant="secondary">
                Vezi cererile noi
              </Button>
              <Button href="/admin/setari" variant="link">
                Setări
              </Button>
            </div>
          </div>
        ) : (
          <Notice tone="error">Nu am putut citi cererile. Reîncarcă pagina.</Notice>
        )}
      </AdminSection>
    </AdminPage>
  );
}
