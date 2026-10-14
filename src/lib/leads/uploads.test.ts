// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_LEAD_ID, fakeAdmin } from "./admin.fake";
import { attachUploads } from "./uploads";

vi.mock("server-only", () => ({}));

const UUID = "0b3a9a1e-1234-4abc-8def-0123456789ab";
const P1 = `pending/${UUID}/1.jpg`;
const P2 = `pending/${UUID}/2.webp`;
const P3 = `pending/${UUID}/3.png`;

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attachUploads", () => {
  it("moves existing pending files under the lead and records them", async () => {
    const fake = fakeAdmin({ objects: { [P1]: 1234, [P2]: 5678 } });
    expect(await attachUploads(fake.client, FAKE_LEAD_ID, [P1, P2])).toBe(2);

    expect(fake.moves).toEqual([
      [P1, `${FAKE_LEAD_ID}/1.jpg`],
      [P2, `${FAKE_LEAD_ID}/2.webp`],
    ]);
    expect(Object.keys(fake.objects).sort()).toEqual([`${FAKE_LEAD_ID}/1.jpg`, `${FAKE_LEAD_ID}/2.webp`]);
    expect(fake.inserts).toEqual([
      { table: "lead_files", rows: [{ lead_id: FAKE_LEAD_ID, path: `${FAKE_LEAD_ID}/1.jpg`, mime: "image/jpeg", size_bytes: 1234 }] },
      { table: "lead_files", rows: [{ lead_id: FAKE_LEAD_ID, path: `${FAKE_LEAD_ID}/2.webp`, mime: "image/webp", size_bytes: 5678 }] },
    ]);
  });

  it("refuses paths outside pending/, with traversal or an unknown extension", async () => {
    const fake = fakeAdmin({ objects: { "other/x/1.jpg": 1, [`pending/${UUID}/1.gif`]: 1 } });
    expect(
      await attachUploads(fake.client, FAKE_LEAD_ID, ["other/x/1.jpg", `pending/${UUID}/../1.jpg`, `pending/${UUID}/1.gif`]),
    ).toBe(0);
    expect(fake.moves).toEqual([]);
    expect(fake.inserts).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("skips a file that does not exist and keeps the others, numbered by position", async () => {
    const fake = fakeAdmin({ objects: { [P1]: 10, [P3]: 30 } });
    expect(await attachUploads(fake.client, FAKE_LEAD_ID, [P1, P2, P3])).toBe(2);
    expect(fake.moves).toEqual([
      [P1, `${FAKE_LEAD_ID}/1.jpg`],
      [P3, `${FAKE_LEAD_ID}/3.png`],
    ]);
    expect(fake.inserts.map((i) => i.rows[0].mime)).toEqual(["image/jpeg", "image/png"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("logs and skips a failed move or lead_files insert", async () => {
    const moveFail = fakeAdmin({ objects: { [P1]: 10, [P2]: 20 }, moveFails: [P1] });
    expect(await attachUploads(moveFail.client, FAKE_LEAD_ID, [P1, P2])).toBe(1);
    expect(moveFail.inserts).toHaveLength(1);
    expect(moveFail.inserts[0].rows[0].path).toBe(`${FAKE_LEAD_ID}/2.webp`);
    expect(error).toHaveBeenCalledTimes(1);

    const insertFail = fakeAdmin({ objects: { [P1]: 10 }, insertErrors: { lead_files: "rls" } });
    expect(await attachUploads(insertFail.client, FAKE_LEAD_ID, [P1])).toBe(0);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("never throws, even when the listing fails", async () => {
    const fake = fakeAdmin({ objects: { [P1]: 10 }, listError: "storage down" });
    expect(await attachUploads(fake.client, FAKE_LEAD_ID, [P1])).toBe(0);
    expect(fake.moves).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("stops at the file limit", async () => {
    const paths = Array.from({ length: 8 }, (_, i) => `pending/${UUID}/${i + 1}.jpg`);
    const fake = fakeAdmin({ objects: Object.fromEntries(paths.map((p) => [p, 1])) });
    expect(await attachUploads(fake.client, FAKE_LEAD_ID, paths)).toBe(6);
    expect(fake.moves).toHaveLength(6);
  });
});
