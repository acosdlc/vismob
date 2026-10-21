import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { DeleteLeadButton } from "@/components/admin/DeleteLeadButton";
import { LeadStatusForm } from "@/components/admin/LeadStatusForm";
import { AdminPage, AdminSection, MetaList, Notice, StatusBadge } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { telHref } from "@/components/site/links";
import { Ticket } from "@/components/site/Ticket";
import { formatLeadDate, leadConfig, leadSourceText, leadTicketRows, whatsappHref } from "@/lib/admin/leads";
import { ADMIN_MESSAGES, LEAD_KIND_LABELS } from "@/lib/admin/types";
import { formatPrice, ticketRows } from "@/lib/configurator/format";
import { resolve } from "@/lib/configurator/rules";
import { getCatalog } from "@/lib/data/catalog";
import { UPLOAD_LIMITS, type LeadRow } from "@/lib/leads/types";
import { shareUrl } from "@/lib/site-url";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cerere" };

/** A Postgres uuid, in any version: anything else is not a lead and gets the 404 without a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How long a photo link works once the page is open. */
const SIGNED_URL_SECONDS = 600;

/** Shown over the screen when the lead cannot be read. */
const READ_FAILED = "Nu am putut citi cererea. Reîncarcă pagina.";
/** Shown in the „Poze” section when the links cannot be signed. */
const PHOTOS_FAILED = "Nu am putut genera linkurile pozelor. Reîncarcă pagina.";

type LeadFile = Pick<Tables<"lead_files">, "path" | "mime" | "size_bytes">;

type LeadRead =
  | { kind: "found"; lead: LeadRow; files: LeadFile[]; supabase: ServerClient }
  | { kind: "missing" }
  | { kind: "failed"; problem: string };

interface Photo {
  path: string;
  url: string;
}

interface ConfigTicket {
  rows: { k: string; v: string }[];
  href: string;
}

// PLAN PR-7 „Cereri”, the detail: the ticket with the contact rows, the configuration
// sheet and its link for a configurator lead, the photos through signed URLs, where
// the request came from, then the status + notes form and the delete. Everything is
// read through the signed-in user's cookie client (ARHITECTURA §8); the (panel)
// layout's <Suspense> guard lets params and cookies() be read at the top level.
export default async function CererePage({ params }: PageProps<"/admin/cereri/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const read = await readLead(id);
  if (read.kind === "missing") notFound();
  if (read.kind === "failed") {
    return (
      <AdminPage title="Cerere">
        <Notice tone="error">{read.problem}</Notice>
      </AdminPage>
    );
  }

  const { lead, files, supabase } = read;
  const kindLabel = LEAD_KIND_LABELS[lead.kind];
  const [config, photos] = await Promise.all([configTicket(lead), signPhotos(supabase, files)]);
  const whatsapp = whatsappHref(lead.phone);
  const source = leadSourceText(lead.source);
  const meta: { k: string; v: string }[] = [];
  if (source.source) meta.push({ k: "Sursă", v: source.source });
  if (source.environment) meta.push({ k: "Mediu", v: source.environment });
  meta.push({ k: "ID", v: lead.id });

  return (
    <AdminPage
      title={lead.name}
      lead={`${kindLabel} · ${formatLeadDate(lead.created_at)}`}
      actions={
        <>
          <Button href={telHref(lead.phone)} variant="secondary">
            Sună
          </Button>
          {whatsapp && (
            <Button href={whatsapp} variant="secondary" target="_blank" rel="noreferrer">
              WhatsApp
            </Button>
          )}
          <Button href={`mailto:${lead.email}`} variant="secondary">
            Email
          </Button>
        </>
      }
    >
      <div className="grid gap-8 nav:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-4">
            <Ticket title={kindLabel} number={lead.config_code ?? undefined} rows={leadTicketRows(lead)} size="md" />
            <p className="flex flex-wrap items-center gap-3">
              <span className="mono-13 text-muted">Status</span>
              <StatusBadge status={lead.status} />
            </p>
          </div>

          {config && (
            <Ticket title="Fișă de configurare" number={lead.config_code ?? undefined} rows={config.rows} size="md">
              <div className="border-t border-dashed border-rule pt-3">
                <Button href={config.href} variant="link">
                  Deschide configurația
                </Button>
              </div>
            </Ticket>
          )}

          {files.length > 0 && (
            <AdminSection title="Poze" aside={photos.urls.length > 0 ? "Linkurile sunt valabile 10 minute." : undefined}>
              {photos.problem && <Notice tone="error">{photos.problem}</Notice>}
              {photos.urls.length > 0 && (
                <ul className="flex flex-wrap gap-3">
                  {photos.urls.map((photo, index) => (
                    <li key={photo.path}>
                      <a href={photo.url} target="_blank" rel="noreferrer" className="block">
                        {/* The bucket is private and the URL is signed and short-lived, so next/image
                            cannot optimise it: a plain <img> at the thumbnail size. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={`Poza ${index + 1}`}
                          width={160}
                          height={160}
                          loading="lazy"
                          className="size-40 border border-rule bg-card object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </AdminSection>
          )}

          <MetaList rows={meta} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <LeadStatusForm leadId={lead.id} status={lead.status} notes={lead.notes} />
          <DeleteLeadButton leadId={lead.id} name={lead.name} />
        </div>
      </div>
    </AdminPage>
  );
}

async function readLead(id: string): Promise<LeadRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("CererePage: createClient", err);
    return { kind: "failed", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const [lead, files] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).maybeSingle(),
      supabase.from("lead_files").select("path, mime, size_bytes").eq("lead_id", id).order("path"),
    ]);
    if (lead.error) throw new Error(`leads: ${lead.error.message}`);
    if (!lead.data) return { kind: "missing" };
    if (files.error) throw new Error(`lead_files: ${files.error.message}`);
    return { kind: "found", lead: lead.data, files: files.data, supabase };
  } catch (err) {
    unstable_rethrow(err);
    console.error(`CererePage: lead ${id}`, err);
    return { kind: "failed", problem: READ_FAILED };
  }
}

/**
 * The „Fișă de configurare” rows and the link that reopens the configuration, for
 * a lead whose stored config is an object (configurator leads). The stored object
 * is resolved against the current catalogue, like the server did when it arrived;
 * the price is the one stored with the lead, never recomputed.
 */
async function configTicket(lead: LeadRow): Promise<ConfigTicket | null> {
  const config = leadConfig(lead);
  if (!config) return null;
  try {
    const catalog = await getCatalog();
    const rows = ticketRows(resolve(config, catalog));
    if (lead.price_estimate_ron !== null) rows.push({ k: "Preț orientativ", v: formatPrice(lead.price_estimate_ron) });
    return { rows, href: shareUrl(config) };
  } catch (err) {
    console.error(`CererePage: config of lead ${lead.id}`, err);
    return null;
  }
}

/** Signed links to the lead's photos in the private bucket, through the user's client (RLS: admin_all_lead_uploads). */
async function signPhotos(supabase: ServerClient, files: LeadFile[]): Promise<{ urls: Photo[]; problem: string | null }> {
  if (files.length === 0) return { urls: [], problem: null };
  try {
    const { data, error } = await supabase.storage
      .from(UPLOAD_LIMITS.bucket)
      .createSignedUrls(
        files.map((file) => file.path),
        SIGNED_URL_SECONDS,
      );
    if (error) throw new Error(error.message);
    const urls: Photo[] = [];
    for (const item of data) {
      if (item.signedUrl && item.path) urls.push({ path: item.path, url: item.signedUrl });
      else console.error(`CererePage: signed url for ${item.path ?? "?"}: ${item.error ?? "no url"}`);
    }
    return { urls, problem: urls.length === files.length ? null : PHOTOS_FAILED };
  } catch (err) {
    unstable_rethrow(err);
    console.error("CererePage: createSignedUrls", err);
    return { urls: [], problem: PHOTOS_FAILED };
  }
}
