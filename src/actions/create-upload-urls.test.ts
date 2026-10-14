// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAdmin, type FakeAdmin } from "@/lib/leads/admin.fake";
import { FORM_MESSAGES, UPLOAD_LIMITS } from "@/lib/leads/types";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

const mocks = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.admin }));

import { createUploadUrls } from "./create-upload-urls";

const PENDING_PATH = /^pending\/[0-9a-f-]{36}\/(\d+)\.jpg$/;

let fake: FakeAdmin;

beforeEach(() => {
  vi.stubEnv("IP_HASH_SALT", "salt");
  fake = fakeAdmin();
  mocks.admin = fake.client;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createUploadUrls", () => {
  it("refuses a count outside 1..maxFiles without touching the database", async () => {
    for (const count of [0, UPLOAD_LIMITS.maxFiles + 1, 2.5, Number.NaN, -1]) {
      expect(await createUploadUrls(count)).toEqual({ ok: false, message: FORM_MESSAGES.uploads });
    }
    expect(fake.countQueries).toEqual([]);
    expect(fake.inserts).toEqual([]);
  });

  it("issues one signed path per file under a single pending/ folder and records the requests", async () => {
    const result = await createUploadUrls(3);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected signed urls");

    expect(result.uploads).toHaveLength(3);
    const folders = new Set<string>();
    result.uploads.forEach((upload, index) => {
      const match = PENDING_PATH.exec(upload.path);
      expect(match, upload.path).not.toBeNull();
      expect(match?.[1]).toBe(String(index + 1));
      expect(upload.token).toBe(`token-for-${upload.path}`);
      folders.add(upload.path.slice(0, upload.path.lastIndexOf("/")));
    });
    expect(folders.size).toBe(1);

    // The per-IP count was read on upload_requests, then three rows were written with the hash.
    expect(fake.countQueries.map((q) => q.table)).toEqual(["upload_requests"]);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0].table).toBe("upload_requests");
    expect(fake.inserts[0].rows).toHaveLength(3);
    const hashes = new Set(fake.inserts[0].rows.map((row) => row.ip_hash));
    expect(hashes.size).toBe(1);
    expect([...hashes][0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stops at the hourly limit per IP and records nothing", async () => {
    fake = fakeAdmin({ counts: { upload_requests: UPLOAD_LIMITS.maxUrlsPerIpPerHour - 5 } });
    mocks.admin = fake.client;
    expect(await createUploadUrls(6)).toEqual({ ok: false, message: FORM_MESSAGES.rateLimited });
    expect(fake.inserts).toEqual([]);

    // Exactly up to the limit still passes.
    expect((await createUploadUrls(5)).ok).toBe(true);
  });

  it("answers with the generic message when the database or the salt is missing", async () => {
    fake = fakeAdmin({ insertErrors: { upload_requests: "connection refused" } });
    mocks.admin = fake.client;
    expect(await createUploadUrls(1)).toEqual({ ok: false, message: FORM_MESSAGES.generic });

    vi.stubEnv("IP_HASH_SALT", "");
    expect(await createUploadUrls(1)).toEqual({ ok: false, message: FORM_MESSAGES.generic });
  });
});
