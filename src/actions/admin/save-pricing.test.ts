// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/admin/session";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";
import type { Pricing } from "@/lib/configurator/pricing";
import { PRICING_MESSAGES, PRICING_WIDTHS } from "@/lib/configurator/pricing-schema";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag, refresh: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { savePricing } from "./save-pricing";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

// A fixture only (the style of src/lib/configurator/pricing.test.ts): never a real price.
const PRICING: Pricing = {
  grid: {
    capitonat: { "90": 2000, "120": 2400, "140": 2800, "160": 3000, "180": 3400, "200": 3800 },
    arcuit: { "160": 3200, "180": 3600 },
    canale: { "160": 3300 },
    lamele: {},
  },
  categoryPct: { A: 0, B: 10, C: 20 },
  hbPct: { "100": 0, "120": 5, "140": 10 },
  base: { lemn: 0, metal: 100, lada: 800, sertare: 600 },
  extras: { led: 300, nightstands: 1200 },
  customPct: 15,
  roundTo: 50,
};

/** The one chain the action runs: from("pricing").upsert({ id, data, updated_at }).select("id"). */
interface FakeCalls {
  table?: string;
  upsert?: unknown;
  select?: string;
}

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: FakeCalls = {};
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        upsert(payload: unknown) {
          calls.upsert = payload;
          return {
            select: async (columns: string) => {
              calls.select = columns;
              return result;
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

/** The form's post for a Pricing: every number as a string, a width without a price as "". */
function formFor(pricing: Pricing, patch: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [model, row] of Object.entries(pricing.grid)) {
    for (const width of PRICING_WIDTHS) fd.set(`grid.${model}.${width}`, row[width] === undefined ? "" : String(row[width]));
  }
  for (const [category, pct] of Object.entries(pricing.categoryPct)) fd.set(`categoryPct.${category}`, String(pct));
  for (const [height, pct] of Object.entries(pricing.hbPct)) fd.set(`hbPct.${height}`, String(pct));
  for (const [base, lei] of Object.entries(pricing.base)) fd.set(`base.${base}`, String(lei));
  fd.set("extras.led", String(pricing.extras.led));
  fd.set("extras.nightstands", String(pricing.extras.nightstands));
  fd.set("customPct", String(pricing.customPct));
  fd.set("roundTo", String(pricing.roundTo));
  for (const [name, value] of Object.entries(patch)) fd.set(name, value);
  return fd;
}

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.createClient.mockReset();
  mocks.updateTag.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ now: new Date("2026-10-21T10:00:00.000Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("savePricing", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await savePricing(ADMIN_INITIAL_STATE, formFor(PRICING));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid grid without writing", async () => {
    const fd = formFor(PRICING, { "grid.capitonat.160": "0", roundTo: "" });
    const state = await savePricing(ADMIN_INITIAL_STATE, fd);
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { "grid.capitonat.160": PRICING_MESSAGES.positive, roundTo: PRICING_MESSAGES.number },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("upserts the parsed grid as pricing row 1 with the time of the save, then expires the pricing tag", async () => {
    const { client, calls } = fakeClient({ data: [{ id: 1 }], error: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await savePricing(ADMIN_INITIAL_STATE, formFor(PRICING));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls).toEqual({
      table: "pricing",
      upsert: { id: 1, data: PRICING, updated_at: "2026-10-21T10:00:00.000Z" },
      select: "id",
    });
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("pricing");
  });

  it("treats a write of 0 rows as a missing role (RLS filters silently)", async () => {
    const { client } = fakeClient({ data: [], error: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await savePricing(ADMIN_INITIAL_STATE, formFor(PRICING));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient({ data: null, error: { message: "new row violates row-level security policy" } });
    mocks.createClient.mockResolvedValue(client);

    const state = await savePricing(ADMIN_INITIAL_STATE, formFor(PRICING));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("row-level security"));
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));

    const state = await savePricing(ADMIN_INITIAL_STATE, formFor(PRICING));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
