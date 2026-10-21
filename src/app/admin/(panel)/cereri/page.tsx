import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { LeadsFilters } from "@/components/admin/LeadsFilters";
import { AdminPage, AdminSection, EmptyState, Notice, StatusBadge, Table, TableWrap, Td, Th } from "@/components/admin/ui";
import { telHref } from "@/components/site/links";
import {
  applyLeadFilters,
  formatLeadDate,
  leadCountLabel,
  LEADS_PAGE_SIZE,
  parseLeadFilters,
  type LeadFilters,
} from "@/lib/admin/leads";
import { ADMIN_MESSAGES, LEAD_KIND_LABELS } from "@/lib/admin/types";
import type { LeadRow } from "@/lib/leads/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cereri" };

/** The columns the list reads. */
const LIST_COLUMNS = "id, created_at, kind, status, name, phone, email, city, config_code, price_estimate_ron";
type LeadListRow = Pick<
  LeadRow,
  "id" | "created_at" | "kind" | "status" | "name" | "phone" | "email" | "city" | "config_code" | "price_estimate_ron"
>;

type LeadsResult = { ok: true; leads: LeadListRow[] } | { ok: false; problem: string };

/** Shown in place of the table when the query fails. */
const READ_FAILED = "Nu am putut citi cererile. Reîncarcă pagina.";

const LINK = "inline-flex min-h-11 items-center underline hover:text-accent";

// PLAN PR-7 „Cereri”: the list with its filters (tip / status / perioadă, search),
// newest first, read through the signed-in user's cookie client (ARHITECTURA §8).
// The (panel) layout wraps this page in the guard's <Suspense>, so searchParams and
// cookies() may be read at the top level.
export default async function CereriPage({ searchParams }: PageProps<"/admin/cereri">) {
  const sp = await searchParams;
  const filters = parseLeadFilters(sp);
  const result = await readLeads(filters);

  return (
    <AdminPage title="Cereri" lead="Cererile primite de pe site, cele mai noi mai întâi.">
      <LeadsFilters filters={filters} />
      {result.ok ? <LeadsTable leads={result.leads} /> : <Notice tone="error">{result.problem}</Notice>}
    </AdminPage>
  );
}

async function readLeads(filters: LeadFilters): Promise<LeadsResult> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("CereriPage: createClient", err);
    return { ok: false, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const query = supabase.from("leads").select(LIST_COLUMNS);
    const { data, error } = await applyLeadFilters(query, filters, new Date())
      .order("created_at", { ascending: false })
      .limit(LEADS_PAGE_SIZE);
    if (error) throw new Error(error.message);
    return { ok: true, leads: data };
  } catch (err) {
    unstable_rethrow(err);
    console.error("CereriPage: leads", err);
    return { ok: false, problem: READ_FAILED };
  }
}

function LeadsTable({ leads }: { leads: LeadListRow[] }) {
  const aside = [leadCountLabel(leads.length), leads.length >= LEADS_PAGE_SIZE && `Se afișează primele ${LEADS_PAGE_SIZE}.`]
    .filter(Boolean)
    .join(" · ");

  return (
    <AdminSection title="Rezultate" aside={aside}>
      {leads.length === 0 ? (
        <EmptyState>Nicio cerere pentru filtrele alese.</EmptyState>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Tip</Th>
                <Th>Nume</Th>
                <Th>Contact</Th>
                <Th>Cod</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="[&>td]:align-middle">
                  <Td className="whitespace-nowrap">{formatLeadDate(lead.created_at)}</Td>
                  <Td>{LEAD_KIND_LABELS[lead.kind]}</Td>
                  <Td>
                    <Link href={`/admin/cereri/${lead.id}`} className={`${LINK} font-semibold`}>
                      {lead.name}
                    </Link>
                    {lead.city && <span className="block text-[13px] text-muted">{lead.city}</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-x-4">
                      <a href={telHref(lead.phone)} className={`${LINK} whitespace-nowrap`}>
                        {lead.phone}
                      </a>
                      <a href={`mailto:${lead.email}`} className={`${LINK} break-all`}>
                        {lead.email}
                      </a>
                    </div>
                  </Td>
                  <Td className="mono-13 whitespace-nowrap">{lead.config_code ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={lead.status} />
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
