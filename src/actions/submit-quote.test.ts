// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUOTE_FIELDS } from "@/components/configurator/types";
import { DEFAULT_CONFIG, SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { Pricing } from "@/lib/configurator/pricing";
import { paramsFromConfig } from "@/lib/configurator/url";
import { fakeAdmin, FAKE_LEAD_ID, type FakeAdmin } from "@/lib/leads/admin.fake";
import { FORM_FIELDS, FORM_MESSAGES } from "@/lib/leads/types";
import { mintFormToken } from "@/lib/security/form-token";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  fake: null as unknown,
  pricing: null as unknown,
  after: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => mocks.after(cb) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => (mocks.fake as FakeAdmin).client }));
vi.mock("@/lib/data/catalog", () => ({ getCatalog: async () => SEED_CATALOG }));
vi.mock("@/lib/data/pricing", () => ({ getPricing: async () => mocks.pricing }));
vi.mock("@/lib/notify/dispatch", () => ({ dispatchLeadNotifications: mocks.dispatch }));

import { submitQuote } from "./submit-quote";

// A fixture only (the style of pricing.test.ts): the workshop's real grid arrives in PR-7.
const PRICING: Pricing = {
  grid: { capitonat: { "160": 3000, "180": 3400 }, arcuit: {}, canale: {}, lamele: {} },
  categoryPct: { A: 0, B: 10, C: 20 },
  hbPct: { "100": 0, "120": 5, "140": 10 },
  base: { lemn: 0, metal: 100, lada: 800, sertare: 600 },
  extras: { led: 300, nightstands: 1200 },
  customPct: 15,
  roundTo: 50,
};

const VALID = {
  name: "Ana Pop",
  phone: "0722 123 456",
  email: "Ana.Pop@Example.com",
  city: "Cluj",
  privacy: "on",
  [QUOTE_FIELDS.config]: paramsFromConfig(DEFAULT_CONFIG).toString(),
};

function form(entries: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) fd.set(key, value);
  fd.set(FORM_FIELDS.startedAt, mintFormToken(Date.now() - 5_000));
  return fd;
}

const insertedLead = () => (mocks.fake as FakeAdmin).inserts.find((i) => i.table === "leads")?.rows[0];

beforeEach(() => {
  vi.stubEnv("IP_HASH_SALT", "salt");
  vi.stubEnv("FORM_HMAC_SECRET", "hmac");
  vi.stubEnv("VERCEL_ENV", "preview");
  mocks.fake = fakeAdmin();
  mocks.pricing = null;
  mocks.after.mockReset();
  mocks.dispatch.mockReset();
  mocks.dispatch.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("submitQuote", () => {
  it("stores a configurator lead with the code recomputed on the server and no price without a grid", async () => {
    const state = await submitQuote({ status: "idle" }, form(VALID));

    expect(state).toEqual({ status: "ok", leadId: FAKE_LEAD_ID, code: "CAP-160x200-CT01-H120-PL" });
    expect(insertedLead()).toMatchObject({
      kind: "configurator",
      name: "Ana Pop",
      phone: "+40722123456",
      email: "ana.pop@example.com",
      city: "Cluj",
      config: DEFAULT_CONFIG,
      config_code: "CAP-160x200-CT01-H120-PL",
      price_estimate_ron: null,
      mattress_size: null,
    });
  });

  it("stores the rounded price from the grid, ignoring any price the client posts", async () => {
    mocks.pricing = PRICING;
    // 180: 3400 × 1.05 + 800 + 300 = 4670 → 4650; the posted price never counts.
    const config = { ...DEFAULT_CONFIG, size: "180" as const, base: "lada" as const, led: true };
    const state = await submitQuote(
      { status: "idle" },
      form({ ...VALID, [QUOTE_FIELDS.config]: paramsFromConfig(config).toString(), price: "1", price_estimate_ron: "1" }),
    );

    expect(state).toMatchObject({ status: "ok", code: "CAP-180x200-CT01-H120-LD-LED" });
    expect(insertedLead()).toMatchObject({ config_code: "CAP-180x200-CT01-H120-LD-LED", price_estimate_ron: 4650 });
    expect(insertedLead()).not.toHaveProperty("price");
  });

  it("repairs an invalid configuration with resolve() before storing it", async () => {
    const state = await submitQuote(
      { status: "idle" },
      form({ ...VALID, [QUOTE_FIELDS.config]: "m=lamele&f=catifea&c=ct-verde&s=999&h=7&b=nope" }),
    );
    // Lamele takes only wood (§5.2); unknown size, height and base fall back to the defaults.
    expect(state).toMatchObject({ status: "ok", code: "LAM-160x200-LM01-H120-PL" });
    expect(insertedLead()).toMatchObject({
      config: { model: "lamele", family: "lemn", color: "lm-stejar", size: "160", hb: 120, base: "lemn" },
    });
  });

  it("answers the required message on the config field when it is missing", async () => {
    const state = await submitQuote({ status: "idle" }, form({ ...VALID, [QUOTE_FIELDS.config]: undefined }));
    expect(state).toEqual({
      status: "error",
      message: FORM_MESSAGES.required,
      fieldErrors: { [QUOTE_FIELDS.config]: FORM_MESSAGES.required },
    });
    expect((mocks.fake as FakeAdmin).inserts).toEqual([]);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("sends both emails after the response and never lets a failure out", async () => {
    await submitQuote({ status: "idle" }, form(VALID));

    expect(mocks.after).toHaveBeenCalledTimes(1);
    const callback = mocks.after.mock.calls[0][0] as () => Promise<void>;
    await callback();
    expect(mocks.dispatch).toHaveBeenCalledWith(FAKE_LEAD_ID);

    mocks.dispatch.mockRejectedValueOnce(new Error("resend down"));
    await expect(callback()).resolves.toBeUndefined();
  });

  it("returns the pipeline's state when the lead is refused", async () => {
    const fd = form(VALID);
    fd.set(FORM_FIELDS.honeypot, "Acme");
    const state = await submitQuote({ status: "idle" }, fd);
    expect(state).toEqual({ status: "error", message: FORM_MESSAGES.generic });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
