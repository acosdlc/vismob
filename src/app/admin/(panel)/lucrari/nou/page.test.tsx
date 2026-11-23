import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page reads the selects' options through the signed-in client; each test sets what
// the tables hold. The form is the real one, over Server Actions that are never called.
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/actions/admin/save-project", () => ({ saveProject: vi.fn() }));
vi.mock("@/actions/admin/delete-project", () => ({ deleteProject: vi.fn() }));

import ProiectNouPage from "@/app/admin/(panel)/lucrari/nou/page";
import { PROJECT_FORM_TEXTS } from "@/components/admin/ProjectForm";

type Row = Record<string, unknown>;

const TABLES: Record<string, Row[]> = {
  models: [{ id: "capitonat", name: "Capitonat" }],
  materials: [{ id: "ct-verde", name: "Verde sticlă", family_id: "catifea" }],
  material_families: [{ id: "catifea", name: "Catifea" }],
  bases: [{ id: "lemn", name: "Picioare din lemn" }],
};

// A fake of the signed-in cookie client: awaiting a chain resolves to the table's rows,
// or to an error for the table named in `failing`.
function fakeClient(tables: Record<string, Row[]>, failing?: string) {
  return {
    from(table: string) {
      const result = () => (table === failing ? { data: null, error: { message: "timeout" } } : { data: tables[table] ?? [], error: null });
      const q = {
        select: () => q,
        order: () => q,
        then: <R,>(onOk: (value: ReturnType<typeof result>) => R, onErr?: (reason: unknown) => R) => Promise.resolve(result()).then(onOk, onErr),
      };
      return q;
    },
  };
}

const T = PROJECT_FORM_TEXTS;

beforeEach(() => {
  mocks.createClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Proiect nou", () => {
  it("says that the photos and the publishing come after the first save, and offers neither „Publicat” nor the hero box", async () => {
    mocks.createClient.mockResolvedValue(fakeClient(TABLES));
    render(await ProiectNouPage());

    expect(screen.getByRole("heading", { level: 1, name: "Proiect nou" })).toBeInTheDocument();
    // A project is published with a photo, and its photos need the saved row: the lead
    // says where publishing went, since this screen has no box for it.
    expect(screen.getByText("Pozele se adaugă după ce salvezi proiectul; apoi îl poți publica.")).toBeInTheDocument();
    expect(screen.getByLabelText(T.title)).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: T.clientConsent })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: T.published })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: T.hero })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: T.submit })).toBeEnabled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("shows a notice in place of the form when the catalogue cannot be read", async () => {
    mocks.createClient.mockResolvedValue(fakeClient(TABLES, "materials"));
    render(await ProiectNouPage());

    expect(screen.getByRole("alert")).toHaveTextContent("Nu am putut citi catalogul. Reîncarcă pagina.");
    expect(screen.queryByRole("button", { name: T.submit })).not.toBeInTheDocument();
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatch(/ProiectNouPage: catalog/);
  });
});
