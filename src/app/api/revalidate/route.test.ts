// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// next/cache throws outside a Next render; the route only needs the call recorded.
const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: mocks.revalidateTag }));

import { POST, TABLE_TAGS } from "./route";

const SECRET = "a-shared-secret-for-the-webhook";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://www.vismob.dev/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
const authed = (body: string) => post(body, { "x-revalidate-secret": SECRET });
/** A Supabase Database Webhook payload. */
const payload = (table: string, type = "UPDATE") =>
  JSON.stringify({ type, table, schema: "public", record: { id: 1 }, old_record: type === "INSERT" ? null : { id: 1 } });

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("REVALIDATE_SECRET", SECRET);
  mocks.revalidateTag.mockClear();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("TABLE_TAGS", () => {
  it("maps the ten content tables to the five tags", () => {
    expect(TABLE_TAGS).toEqual({
      models: "catalog",
      material_families: "catalog",
      materials: "catalog",
      model_families: "catalog",
      bases: "catalog",
      pricing: "pricing",
      projects: "projects",
      project_photos: "projects",
      reviews: "reviews",
      settings: "settings",
    });
  });
});

describe("POST /api/revalidate", () => {
  it("answers 503 with a generic body and revalidates nothing without REVALIDATE_SECRET", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    const response = await POST(authed(payload("settings")));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("answers 401 without the header", async () => {
    const response = await POST(post(payload("settings")));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 401 for a wrong header, of any length", async () => {
    // (Headers trims surrounding whitespace, so a padded secret is the secret: that case is not a wrong header.)
    for (const wrong of ["", "x", SECRET.slice(0, -1), `${SECRET}-`, SECRET.toUpperCase()]) {
      const response = await POST(post(payload("settings"), { "x-revalidate-secret": wrong }));
      expect(response.status).toBe(401);
    }
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON or has no table", async () => {
    for (const body of ["{not json", "", "null", "[]", "{}", JSON.stringify({ table: "" }), JSON.stringify({ table: 7 })]) {
      const response = await POST(authed(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "bad payload" });
    }
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 400 and logs for a table without a tag", async () => {
    for (const table of ["leads", "lead_events", "constructor", "__proto__", "toString"]) {
      errors.mockClear();
      const response = await POST(authed(payload(table)));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "unknown table" });
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0][0])).toContain(table);
    }
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("expires the table's tag at once and answers 200, for every content table", async () => {
    for (const [table, tag] of Object.entries(TABLE_TAGS)) {
      mocks.revalidateTag.mockClear();
      const response = await POST(authed(payload(table)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ revalidated: true, table, tag });
      expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
      expect(mocks.revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 });
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it("accepts every webhook event type and a payload with only the table", async () => {
    for (const body of [payload("models", "INSERT"), payload("models", "DELETE"), JSON.stringify({ table: "models", extra: 1 })]) {
      const response = await POST(authed(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ revalidated: true, table: "models", tag: "catalog" });
    }
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(3);
  });

  it("rejects an unknown event type", async () => {
    const response = await POST(authed(JSON.stringify({ type: "TRUNCATE", table: "models" })));
    expect(response.status).toBe(400);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
