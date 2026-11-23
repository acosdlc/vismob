import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Catalog } from "@/lib/configurator/types";
import type { LeadRow } from "@/lib/leads/types";

// The two places a catalogue could come from: the signed-in client the page reads
// with, and the site's cached reader, which holds the active rows only. Each test
// sets what the tables hold; the mapper (catalogFromRows) stays the real one.
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

// A configurator request for Arcuit in velvet, bleumarin, on the storage base, with LED.
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
  config: {
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
  },
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
    // The rows are the ones the client chose, so there is nothing to warn about.
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();

    // The whole catalogue through the signed-in client: every table once, no filter on
    // `active`, and never the site's cached reader.
    for (const table of CATALOG_TABLES) {
      const reads = calls.filter((call) => call.table === table);
      expect(reads, table).toHaveLength(1);
      expect(reads[0].filters, table).toEqual([]);
    }
    expect(mocks.getCatalog).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("says above the sheet that the catalogue changed when the configuration no longer gives the stored code", async () => {
    // Since the request came, „Arcuit” allows bouclé instead of velvet: the rules give it another family.
    const tables = {
      ...TABLES,
      model_families: TABLES.model_families.map((mf) => (mf.model_id === "arcuit" ? { ...mf, family_id: "boucle" } : mf)),
      leads: [LEAD],
    };
    mocks.createClient.mockResolvedValue(fakeClient(tables).client);
    render(await CererePage(props(ID)));

    const notice = screen.getByText(CHANGED);
    expect(notice).toHaveAttribute("role", "status");
    expect(notice.compareDocumentPosition(sheet()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The sheet shows what the rules give today; the bar still has the client's code and the stored price.
    expect(value("Material")).toHaveTextContent("Bouclé, alb lapte");
    expect(within(sheet()).getByText(CODE)).toBeInTheDocument();
    expect(value("Preț orientativ")).toHaveTextContent("4.200 lei");
  });

  it("reads no catalogue and shows no sheet for a request without a configuration", async () => {
    const contact: LeadRow = { ...LEAD, kind: "contact", config: null, config_code: null, price_estimate_ron: null };
    const { client, calls } = fakeClient({ ...TABLES, leads: [contact] });
    mocks.createClient.mockResolvedValue(client);
    render(await CererePage(props(ID)));

    expect(screen.getByRole("heading", { level: 1, name: "Ana Pop" })).toBeInTheDocument();
    expect(screen.queryByText("Fișă de configurare")).not.toBeInTheDocument();
    expect(calls.map((call) => call.table)).toEqual(["leads", "lead_files"]);
  });

  it("leaves the sheet out, and keeps the request on screen, when the catalogue cannot be read", async () => {
    mocks.createClient.mockResolvedValue(fakeClient({ ...TABLES, leads: [LEAD] }, "materials").client);
    render(await CererePage(props(ID)));

    expect(screen.getByRole("heading", { level: 1, name: "Ana Pop" })).toBeInTheDocument();
    expect(screen.getByText(CODE)).toBeInTheDocument();
    expect(screen.queryByText("Fișă de configurare")).not.toBeInTheDocument();
    expect(mocks.getCatalog).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatch(/config of lead/);
  });
});
