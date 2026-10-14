// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintFormToken } from "@/lib/security/form-token";
import { contactSchema, parseLeadForm } from "@/lib/validation/schemas";
import { FAKE_LEAD_ID, fakeAdmin, type FakeAdmin } from "./admin.fake";
import { createLead, parseSource, type CreateLeadDeps } from "./create-lead";
import { CONSENT_TEXT, FORM_FIELDS, FORM_MESSAGES, LEADS_PER_IP_PER_HOUR, type FormState } from "./types";

vi.mock("server-only", () => ({}));

const NOW = 1_760_000_000_000;
const IP = "203.0.113.7";
const UUID = "0b3a9a1e-1234-4abc-8def-0123456789ab";

const VALID = {
  name: "Ana Pop",
  phone: "0722 123 456",
  email: "Ana.Pop@Example.com",
  mattressSize: "160 × 200 cm",
  privacy: "on",
  [FORM_FIELDS.turnstile]: "turnstile-token",
  [FORM_FIELDS.source]: JSON.stringify({ page: "/#contact", referrer: "https://google.com/", utm: { utm_source: "ig" } }),
};

function form(entries: Record<string, string | undefined>, startedAgoMs: number | null = 5_000): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) fd.set(key, value);
  if (startedAgoMs !== null) fd.set(FORM_FIELDS.startedAt, mintFormToken(NOW - startedAgoMs));
  return fd;
}

function run(formData: FormData, fake: FakeAdmin, deps: Partial<CreateLeadDeps> = {}) {
  return createLead(
    {
      kind: "contact",
      formData,
      headers: new Headers({ "x-forwarded-for": `${IP}, 10.0.0.1` }),
      parse: (fd) => parseLeadForm(fd, contactSchema),
      toRow: (data, ctx) => ({ mattress_size: data.mattressSize, notes: `env=${ctx.environment}` }),
    },
    { admin: () => fake.client, verifyTurnstile: async () => true, now: () => NOW, ...deps },
  );
}

function errorState(result: Awaited<ReturnType<typeof run>>): FormState & { status: "error" } {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a failure");
  expect(result.state.status).toBe("error");
  return result.state as FormState & { status: "error" };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("IP_HASH_SALT", "salt");
  vi.stubEnv("FORM_HMAC_SECRET", "hmac");
  vi.stubEnv("VERCEL_ENV", "preview");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createLead", () => {
  it("drops a submission with the honeypot filled, before anything else", async () => {
    const fake = fakeAdmin();
    const verifyTurnstile = vi.fn(async () => true);
    const result = await run(form({ ...VALID, [FORM_FIELDS.honeypot]: "Acme" }), fake, { verifyTurnstile });
    expect(errorState(result).message).toBe(FORM_MESSAGES.generic);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(fake.inserts).toEqual([]);
  });

  it("refuses a missing, forged, too fresh or expired form token", async () => {
    const fake = fakeAdmin();
    expect(errorState(await run(form(VALID, null), fake)).message).toBe(FORM_MESSAGES.tooFast);
    expect(errorState(await run(form({ ...VALID, [FORM_FIELDS.startedAt]: `${NOW - 9_000}.${"0".repeat(64)}` }, null), fake)).message).toBe(
      FORM_MESSAGES.tooFast,
    );
    expect(errorState(await run(form(VALID, 2_999), fake)).message).toBe(FORM_MESSAGES.tooFast);
    expect(errorState(await run(form(VALID, 25 * 60 * 60 * 1000), fake)).message).toBe(FORM_MESSAGES.tooFast);
    expect(fake.inserts).toEqual([]);
  });

  it("refuses a submission Turnstile does not confirm, passing the token and ip", async () => {
    const fake = fakeAdmin();
    const verifyTurnstile = vi.fn(async () => false);
    const result = await run(form(VALID), fake, { verifyTurnstile });
    expect(errorState(result).message).toBe(FORM_MESSAGES.turnstile);
    expect(verifyTurnstile).toHaveBeenCalledWith("turnstile-token", IP);
    expect(fake.inserts).toEqual([]);
  });

  it("returns the field errors without touching the database", async () => {
    const fake = fakeAdmin();
    const result = await run(form({ ...VALID, phone: "12", email: "" }), fake);
    const state = errorState(result);
    expect(state.message).toBe(FORM_MESSAGES.required);
    expect(state.fieldErrors).toEqual({ phone: FORM_MESSAGES.phone, email: FORM_MESSAGES.required });
    expect(fake.countQueries).toEqual([]);
    expect(fake.inserts).toEqual([]);
  });

  it("rate-limits on the hashed ip", async () => {
    const fake = fakeAdmin({ counts: { leads: LEADS_PER_IP_PER_HOUR } });
    const result = await run(form(VALID), fake);
    expect(errorState(result).message).toBe(FORM_MESSAGES.rateLimited);
    expect(fake.inserts).toEqual([]);

    const [query] = fake.countQueries;
    expect(query.table).toBe("leads");
    const [, column, hash] = query.filters[0];
    expect(column).toBe("ip_hash");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(IP);
  });

  it("stores the lead with the consent text, the source and the form's columns", async () => {
    const fake = fakeAdmin({ counts: { leads: LEADS_PER_IP_PER_HOUR - 1 } });
    const result = await run(form({ ...VALID, wantsMeasurement: "on", city: " Cluj ", message: "Un pat." }), fake);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leadId).toBe(FAKE_LEAD_ID);
    expect(result.data.phone).toBe("+40722123456");

    expect(fake.inserts).toHaveLength(1);
    const [{ table, rows }] = fake.inserts;
    expect(table).toBe("leads");
    const row = rows[0];
    expect(row).toMatchObject({
      kind: "contact",
      name: "Ana Pop",
      phone: "+40722123456",
      email: "ana.pop@example.com",
      city: "Cluj",
      message: "Un pat.",
      wants_measurement: true,
      consent_text: CONSENT_TEXT,
      mattress_size: "160 × 200 cm",
      notes: "env=preview",
    });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.ip_hash).toBe(fake.countQueries[0].filters[0][2]);
    expect(row.source).toEqual({
      page: "/#contact",
      environment: "preview",
      referrer: "https://google.com/",
      utm: { utm_source: "ig" },
    });
    expect(fake.moves).toEqual([]);
  });

  it("writes null for empty optional fields and a bare source without the hidden input", async () => {
    const fake = fakeAdmin();
    vi.stubEnv("VERCEL_ENV", undefined);
    const result = await run(form({ ...VALID, [FORM_FIELDS.source]: undefined }), fake);
    expect(result.ok).toBe(true);
    const row = fake.inserts[0].rows[0];
    expect(row.city).toBeNull();
    expect(row.message).toBeNull();
    expect(row.wants_measurement).toBe(false);
    expect(row.source).toEqual({ page: "", environment: "local" });
  });

  it("moves the pending photos under the lead and records them in lead_files", async () => {
    const p1 = `pending/${UUID}/1.jpg`;
    const p2 = `pending/${UUID}/2.jpg`;
    const missing = `pending/${UUID}/3.jpg`;
    const fake = fakeAdmin({ objects: { [p1]: 100, [p2]: 200 } });

    const result = await run(form({ ...VALID, [FORM_FIELDS.uploads]: JSON.stringify([p1, p2, missing]) }), fake);
    expect(result.ok).toBe(true);

    expect(fake.moves).toEqual([
      [p1, `${FAKE_LEAD_ID}/1.jpg`],
      [p2, `${FAKE_LEAD_ID}/2.jpg`],
    ]);
    const files = fake.inserts.filter((i) => i.table === "lead_files").map((i) => i.rows[0]);
    expect(files).toEqual([
      { lead_id: FAKE_LEAD_ID, path: `${FAKE_LEAD_ID}/1.jpg`, mime: "image/jpeg", size_bytes: 100 },
      { lead_id: FAKE_LEAD_ID, path: `${FAKE_LEAD_ID}/2.jpg`, mime: "image/jpeg", size_bytes: 200 },
    ]);
  });

  it("still succeeds when a photo cannot be moved", async () => {
    const p1 = `pending/${UUID}/1.jpg`;
    const fake = fakeAdmin({ objects: { [p1]: 100 }, moveFails: [p1] });
    const result = await run(form({ ...VALID, [FORM_FIELDS.uploads]: JSON.stringify([p1]) }), fake);
    expect(result.ok).toBe(true);
    expect(fake.inserts.filter((i) => i.table === "lead_files")).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it("answers with the generic message when something throws", async () => {
    const fake = fakeAdmin();
    const thrown = await run(form(VALID), fake, {
      admin: () => {
        throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
      },
    });
    expect(errorState(thrown).message).toBe(FORM_MESSAGES.generic);
    expect(consoleError).toHaveBeenCalledWith("createLead(contact)", expect.any(Error));

    vi.stubEnv("IP_HASH_SALT", "");
    expect(errorState(await run(form(VALID), fake)).message).toBe(FORM_MESSAGES.generic);
    expect(fake.inserts).toEqual([]);
  });

  it("answers with the generic message when the insert fails", async () => {
    const fake = fakeAdmin({ insertErrors: { leads: "permission denied" } });
    expect(errorState(await run(form(VALID), fake)).message).toBe(FORM_MESSAGES.generic);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("parseSource", () => {
  it("keeps only the known keys, bounded, and adds the environment", () => {
    expect(parseSource(null, "production")).toEqual({ page: "", environment: "production" });
    expect(parseSource("not json", "production")).toEqual({ page: "", environment: "production" });
    expect(parseSource(JSON.stringify(["x"]), "production")).toEqual({ page: "", environment: "production" });
    expect(
      parseSource(JSON.stringify({ page: "/contact", environment: "forged", extra: 1, utm: { a: "1", b: 2, c: "" } }), "preview"),
    ).toEqual({ page: "/contact", environment: "preview", utm: { a: "1" } });
    expect(parseSource(JSON.stringify({ page: "x".repeat(600) }), "preview").page).toHaveLength(500);
  });
});
