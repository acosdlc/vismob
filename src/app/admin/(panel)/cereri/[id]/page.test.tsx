import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Catalog } from "@/lib/configurator/types";
import type { LeadRow } from "@/lib/leads/types";

// The two catalogues the page reads: the whole one, through the signed-in client,
// for the sheet, and the site's cached reader, which holds the active rows only, for
// what the link opens. Each test sets what the tables hold and what the site offers;
// the mapper (catalogFromRows) stays the real one.
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getCatalog: vi.fn() }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/data/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/catalog")>()),
  getCatalog: mocks.getCatalog,
}));
// The two forms bring their Server Actions; the page only places them.
vi.mock("@/components/admin/LeadStatusForm", () => ({ LeadStatusForm: () => null }));
vi.mock("@/components/admin/DeleteLeadButton", () => ({ DeleteLeadButton: () => null }));

import CererePage from "@/app/admin/(panel)/cereri/[id]/page";

const ID = "0b6a3c9e-6f0f-4c55-9d5e-2f6f1f6f7a10";
const CODE = "ARC-160x200-CT02-H120-LD-LED";
const CHANGED = "Catalogul s-a schimbat de când a venit cererea. Codul din bara fișei e cel trimis de client.";
const LINK_OPENS_ANOTHER = "Site-ul nu mai oferă această configurație; linkul deschide alta.";
const CATALOG_FAILED = "Nu am putut citi catalogul. Reîncarcă pagina.";

type Row = Record<string, unknown>;

// The catalogue tables as the signed-in admin reads them (admin_all): the model
// „Arcuit”, the colour „Bleumarin” and the base „Ladă de depozitare” were switched
// off after the request below arrived.
const TABLES: Record<string, Row[]> = {
  models: [
    { id: "capitonat", name: "Capitonat", note: "Tapițat, cu nasturi", code: "CAP", description: null, sort: 0, active: true },
    { id: "arcuit", name: "Arcuit", note: "Linie curbă, bordură", code: "ARC", description: null, sort: 1, active: false },
  ],
  material_families: [
    { id: "catifea", name: "Catifea", code: "CT", tab: "textile", description: null, specs: [], sort: 0 },
    { id: "boucle", name: "Bouclé", code: "BC", tab: "textile", description: null, specs: [], sort: 1 },
  ],
  materials: [
    { id: "ct-verde", family_id: "catifea", name: "Verde sticlă", code: "CT01", hex: "#2F4B3C", price_category: "A", supplier_code: null, featured: true, photo_path: null, sort: 0, active: true },
    { id: "ct-bleumarin", family_id: "catifea", name: "Bleumarin", code: "CT02", hex: "#1F2A44", price_category: "A", supplier_code: null, featured: false, photo_path: null, sort: 1, active: false },
    { id: "bc-alb", family_id: "boucle", name: "Alb lapte", code: "BC01", hex: "#E7E2D8", price_category: "A", supplier_code: null, featured: false, photo_path: null, sort: 0, active: true },
  ],
  model_families: [
    { model_id: "capitonat", family_id: "catifea" },
    { model_id: "capitonat", family_id: "boucle" },
    { model_id: "arcuit", family_id: "catifea" },
  ],
  bases: [
    { id: "lemn", name: "Picioare din lemn", note: "Stejar, [12] cm", code: "PL", photo_path: null, sort: 0, active: true },
    { id: "lada", name: "Ladă de depozitare", note: "Somieră rabatabilă", code: "LD", photo_path: null, sort: 2, active: false },
  ],
};

// What the site offers meanwhile: the active rows only.
const PUBLIC_CATALOG: Catalog = {
  models: [{ id: "capitonat", name: "Capitonat", note: "Tapițat, cu nasturi", code: "CAP", families: ["catifea", "boucle"] }],
  families: [
    { id: "catifea", name: "Catifea", code: "CT", tab: "textile", colors: [{ id: "ct-verde", name: "Verde sticlă", hex: "#2F4B3C", code: "CT01" }] },
    { id: "boucle", name: "Bouclé", code: "BC", tab: "textile", colors: [{ id: "bc-alb", name: "Alb lapte", hex: "#E7E2D8", code: "BC01" }] },
  ],
  bases: [{ id: "lemn", name: "Picioare din lemn", note: "Stejar, [12] cm", code: "PL" }],
};

// The same tables before anything was switched off, as they were when the request came.
const ACTIVE_TABLES: Record<string, Row[]> = Object.fromEntries(
  Object.entries(TABLES).map(([table, rows]) => [table, rows.map((row) => ("active" in row ? { ...row, active: true } : row))]),
);

// What the site offers from those: every row.
const FULL_CATALOG: Catalog = {
  models: [...PUBLIC_CATALOG.models, { id: "arcuit", name: "Arcuit", note: "Linie curbă, bordură", code: "ARC", families: ["catifea"] }],
  families: [
    {
      ...PUBLIC_CATALOG.families[0],
      colors: [...PUBLIC_CATALOG.families[0].colors, { id: "ct-bleumarin", name: "Bleumarin", hex: "#1F2A44", code: "CT02" }],
    },
    PUBLIC_CATALOG.families[1],
  ],
  bases: [...PUBLIC_CATALOG.bases, { id: "lada", name: "Ladă de depozitare", note: "Somieră rabatabilă", code: "LD" }],
};

// Arcuit in velvet, bleumarin, on the storage base, with LED.
const CONFIG = {
  model: "arcuit",
  size: "160",
  customW: 150,
  customL: 200,
  family: "catifea",
  color: "ct-bleumarin",
  hb: 120,
  base: "lada",
  led: true,
  nightstands: false,
};
/** What „Deschide configurația” carries for that request: the stored choices, whatever the catalogue holds today. */
const LINK_QUERY = "/configurator?m=arcuit&s=160&f=catifea&c=ct-bleumarin&h=120&b=lada&led=1";

// A configurator request for that configuration.
const LEAD: LeadRow = {
  id: ID,
  kind: "configurator",
  status: "nou",
  name: "Ana Pop",
  phone: "+40722123456",
  email: "ana@example.com",
  city: "Cluj-Napoca",
  address: null,
  mattress_size: null,
  wants_measurement: false,
  message: null,
  notes: null,
  config: CONFIG,
  config_code: CODE,
  price_estimate_ron: 4200,
  sample_material_ids: null,
  source: null,
  ip_hash: null,
  consent_at: "2026-11-02T08:30:00Z",
  consent_text: "Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.",
  created_at: "2026-11-02T08:30:00Z",
};

interface Call {
  table: string;
  filters: [column: string, value: unknown][];
}

// A fake of the signed-in cookie client: `eq` is recorded and keeps the rows that
// match; awaiting the builder (or maybeSingle()) resolves to the table's rows, or to
// an error for the table named in `failing`.
function fakeClient(tables: Record<string, Row[]>, failing?: string) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      let rows = tables[table] ?? [];
      const result = () =>
        table === failing ? { data: null, error: { message: "timeout" } } : { data: rows, error: null };
      const q = {
        select: () => q,
        order: () => q,
        eq: (column: string, value: unknown) => {
          call.filters.push([column, value]);
          rows = rows.filter((row) => row[column] === value);
          return q;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: <R,>(onOk: (value: ReturnType<typeof result>) => R, onErr?: (reason: unknown) => R) =>
          Promise.resolve(result()).then(onOk, onErr),
      };
      return q;
    },
  };
  return { client, calls };
}

const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

/** The „Fișă de configurare” ticket: its title sits in the bar, the bar in the ticket. */
function sheet(): HTMLElement {
  const ticket = screen.getByText("Fișă de configurare").parentElement?.parentElement;
  if (!ticket) throw new Error("no configuration sheet on the page");
  return ticket;
}

/** The value next to a key of the sheet's rows. */
const value = (k: string) => within(sheet()).getByText(k, { selector: "dt" }).nextElementSibling;

/** The link that reopens the configuration in the public configurator. */
const link = () => screen.getByRole("link", { name: "Deschide configurația" });

const CATALOG_TABLES = ["models", "material_families", "materials", "model_families", "bases"];

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.getCatalog.mockReset();
  mocks.getCatalog.mockResolvedValue(PUBLIC_CATALOG);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cerere: the configuration sheet", () => {
  it("shows the model, the colour and the base the request was sent with after they are switched off", async () => {
    const { client, calls } = fakeClient({ ...TABLES, leads: [LEAD] });
    mocks.createClient.mockResolvedValue(client);
    render(await CererePage(props(ID)));

    expect(value("Model")).toHaveTextContent("Arcuit");
    expect(value("Material")).toHaveTextContent("Catifea, bleumarin");
    expect(value("Bază")).toHaveTextContent("Ladă de depozitare");
    expect(value("Extra")).toHaveTextContent("LED sub pat");
    // The bar carries the stored code, and the price is the stored one.
    expect(within(sheet()).getByText(CODE)).toBeInTheDocument();
    expect(value("Preț orientativ")).toHaveTextContent("4.200 lei");
    // The rows are the ones the client chose, so there is nothing to warn about above them.
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();

    // The whole catalogue through the signed-in client: every table once, no filter on
    // `active`. None of the three rows could come from the site's cached reader, which
    // no longer has them: it is asked once, and only for what the link opens.
    for (const table of CATALOG_TABLES) {
      const reads = calls.filter((call) => call.table === table);
      expect(reads, table).toHaveLength(1);
      expect(reads[0].filters, table).toEqual([]);
    }
    expect(mocks.getCatalog).toHaveBeenCalledTimes(1);
    expect(screen.getByText(LINK_OPENS_ANOTHER)).toBeInTheDocument();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("says by the link that the site opens another configuration when a colour of the request was switched off", async () => {
    // Capitonat in velvet, bleumarin, on wooden legs. Only the colour was switched off since:
    // the public configurator puts the family's first colour in its place.
    const lead: LeadRow = { ...LEAD, config: { ...CONFIG, model: "capitonat", base: "lemn", led: false }, config_code: "CAP-160x200-CT02-H120-PL" };
    mocks.createClient.mockResolvedValue(fakeClient({ ...ACTIVE_TABLES, materials: TABLES.materials, leads: [lead] }).client);
    mocks.getCatalog.mockResolvedValue({ ...FULL_CATALOG, families: PUBLIC_CATALOG.families });
    render(await CererePage(props(ID)));

    // The sheet is right and its code is the stored one: nothing to say above it.
    expect(value("Material")).toHaveTextContent("Catifea, bleumarin");
    expect(within(sheet()).getByText("CAP-160x200-CT02-H120-PL")).toBeInTheDocument();
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();

    // The link still carries the stored colour, which the site would replace with „Verde sticlă”.
    expect(link()).toHaveAttribute("href", expect.stringContaining("/configurator?m=capitonat&s=160&f=catifea&c=ct-bleumarin&h=120&b=lemn"));
    const hint = screen.getByText(LINK_OPENS_ANOTHER);
    expect(hint).toHaveAttribute("role", "status");
    // In the sheet, in the link's own block, read before the link.
    expect(sheet()).toContainElement(hint);
    expect(hint.parentElement).toBe(link().parentElement);
    expect(hint.compareDocumentPosition(link()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mocks.getCatalog).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("says nothing by the link while the site still offers the configuration", async () => {
    mocks.createClient.mockResolvedValue(fakeClient({ ...ACTIVE_TABLES, leads: [LEAD] }).client);
    mocks.getCatalog.mockResolvedValue(FULL_CATALOG);
    render(await CererePage(props(ID)));

    expect(value("Material")).toHaveTextContent("Catifea, bleumarin");
    expect(link()).toHaveAttribute("href", expect.stringContaining(LINK_QUERY));
    expect(screen.queryByText(LINK_OPENS_ANOTHER)).not.toBeInTheDocument();
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says above the sheet that the catalogue changed when the configuration no longer gives the stored code", async () => {
    // Since the request came, „Arcuit” allows bouclé instead of velvet: the rules give it another
    // family. Nothing was switched off, so the site follows the same rules over the same rows.
    const tables = {
      ...ACTIVE_TABLES,
      model_families: TABLES.model_families.map((mf) => (mf.model_id === "arcuit" ? { ...mf, family_id: "boucle" } : mf)),
      leads: [LEAD],
    };
    mocks.createClient.mockResolvedValue(fakeClient(tables).client);
    const site: Catalog = {
      ...FULL_CATALOG,
      models: [FULL_CATALOG.models[0], { ...FULL_CATALOG.models[1], families: ["boucle"] }],
    };
    mocks.getCatalog.mockResolvedValue(site);
    render(await CererePage(props(ID)));

    const notice = screen.getByText(CHANGED);
    expect(notice).toHaveAttribute("role", "status");
    expect(notice.compareDocumentPosition(sheet()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The sheet shows what the rules give today; the bar still has the client's code and the stored price.
    expect(value("Material")).toHaveTextContent("Bouclé, alb lapte");
    expect(within(sheet()).getByText(CODE)).toBeInTheDocument();
    expect(value("Preț orientativ")).toHaveTextContent("4.200 lei");
    // The link opens that same bed, the one the sheet shows: the notice above covers it.
    expect(screen.queryByText(LINK_OPENS_ANOTHER)).not.toBeInTheDocument();
  });

  it("drops only the hint by the link, never the sheet, when the site's catalogue cannot be read", async () => {
    mocks.createClient.mockResolvedValue(fakeClient({ ...TABLES, leads: [LEAD] }).client);
    // In production the site's reader throws when it cannot reach the database (src/lib/data/fallback.ts).
    mocks.getCatalog.mockRejectedValue(new Error("getCatalog: timeout"));
    render(await CererePage(props(ID)));

    expect(value("Model")).toHaveTextContent("Arcuit");
    expect(value("Material")).toHaveTextContent("Catifea, bleumarin");
    expect(value("Bază")).toHaveTextContent("Ladă de depozitare");
    expect(link()).toHaveAttribute("href", expect.stringContaining(LINK_QUERY));
    expect(screen.queryByText(LINK_OPENS_ANOTHER)).not.toBeInTheDocument();
    expect(screen.queryByText(CATALOG_FAILED)).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatch(/link of lead/);
  });

  it("reads no catalogue and shows no sheet, link or notice for a request without a configuration", async () => {
    const contact: LeadRow = { ...LEAD, kind: "contact", config: null, config_code: null, price_estimate_ron: null };
    const { client, calls } = fakeClient({ ...TABLES, leads: [contact] });
    mocks.createClient.mockResolvedValue(client);
    render(await CererePage(props(ID)));

    expect(screen.getByRole("heading", { level: 1, name: "Ana Pop" })).toBeInTheDocument();
    expect(screen.queryByText("Fișă de configurare")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Deschide configurația" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls.map((call) => call.table)).toEqual(["leads", "lead_files"]);
    expect(mocks.getCatalog).not.toHaveBeenCalled();
  });

  it("says where the sheet would be that the catalogue could not be read, and keeps the request and the link on screen", async () => {
    mocks.createClient.mockResolvedValue(fakeClient({ ...TABLES, leads: [LEAD] }, "materials").client);
    render(await CererePage(props(ID)));

    expect(screen.getByRole("heading", { level: 1, name: "Ana Pop" })).toBeInTheDocument();
    expect(screen.getByText(CODE)).toBeInTheDocument();
    expect(screen.queryByText("Fișă de configurare")).not.toBeInTheDocument();
    const notice = screen.getByText(CATALOG_FAILED);
    expect(notice).toHaveAttribute("role", "alert");
    // The link carries the stored choices and needs no catalogue: it stays, under the notice.
    expect(link()).toHaveAttribute("href", expect.stringContaining(LINK_QUERY));
    expect(notice.compareDocumentPosition(link()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Without a sheet there is nothing to compare the site's catalogue with, and it is not
    // a second source for the rows either: they would be the active ones, not the client's.
    expect(mocks.getCatalog).not.toHaveBeenCalled();
    expect(screen.queryByText(LINK_OPENS_ANOTHER)).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatch(/config of lead/);
  });
});
