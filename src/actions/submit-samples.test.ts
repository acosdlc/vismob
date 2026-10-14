// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLES_FIELDS } from "@/components/materials/types";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";
import { fakeAdmin, FAKE_LEAD_ID, type FakeAdmin } from "@/lib/leads/admin.fake";
import { CONSENT_TEXT, FORM_FIELDS, FORM_MESSAGES } from "@/lib/leads/types";
import { mintFormToken } from "@/lib/security/form-token";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  fake: null as unknown,
  settings: null as unknown,
  after: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => mocks.after(cb) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => (mocks.fake as FakeAdmin).client }));
vi.mock("@/lib/data/catalog", () => ({ getCatalog: async () => SEED_CATALOG }));
vi.mock("@/lib/data/settings", () => ({ getSettings: async () => mocks.settings }));
vi.mock("@/lib/notify/dispatch", () => ({ dispatchLeadNotifications: mocks.dispatch }));

import { submitSamples } from "./submit-samples";

const VALID = {
  name: "Ana Pop",
  phone: "0722 123 456",
  email: "Ana.Pop@Example.com",
  address: "Str. Lungă 1, Cluj",
  privacy: "on",
  [SAMPLES_FIELDS.ids]: JSON.stringify(["bc-nisip", "ct-verde", "lm-nuc"]),
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
  mocks.settings = SEED_SETTINGS;
  mocks.after.mockReset();
  mocks.dispatch.mockReset();
  mocks.dispatch.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("submitSamples", () => {
  it("stores a mostre lead with the address and the ids in box order", async () => {
    const state = await submitSamples({ status: "idle" }, form(VALID));

    expect(state).toEqual({ status: "ok", leadId: FAKE_LEAD_ID });
    expect(insertedLead()).toMatchObject({
      kind: "mostre",
      name: "Ana Pop",
      phone: "+40722123456",
      email: "ana.pop@example.com",
      address: "Str. Lungă 1, Cluj",
      sample_material_ids: ["bc-nisip", "ct-verde", "lm-nuc"],
      mattress_size: null,
      message: null,
      wants_measurement: false,
      consent_text: CONSENT_TEXT,
    });
  });

  it("drops ids the catalogue does not know and duplicates", async () => {
    const state = await submitSamples(
      { status: "idle" },
      form({ ...VALID, [SAMPLES_FIELDS.ids]: JSON.stringify(["ct-verde", "nope", "ct-verde", "pe-coniac"]) }),
    );
    expect(state).toMatchObject({ status: "ok" });
    expect(insertedLead()).toMatchObject({ sample_material_ids: ["ct-verde", "pe-coniac"] });
  });

  it("refuses six ids with the limit message and an empty or unknown box with the samples message", async () => {
    const six = ["ct-verde", "ct-mustar", "bc-alb", "bc-nisip", "sf-gri", "pe-coniac"];
    const tooMany = await submitSamples({ status: "idle" }, form({ ...VALID, [SAMPLES_FIELDS.ids]: JSON.stringify(six) }));
    expect(tooMany).toEqual({
      status: "error",
      message: FORM_MESSAGES.required,
      fieldErrors: { [SAMPLES_FIELDS.ids]: "Poți alege cel mult 5 mostre." },
    });

    const unknown = await submitSamples(
      { status: "idle" },
      form({ ...VALID, [SAMPLES_FIELDS.ids]: JSON.stringify(["nope"]) }),
    );
    expect(unknown).toMatchObject({ status: "error", fieldErrors: { [SAMPLES_FIELDS.ids]: FORM_MESSAGES.samples } });

    const missing = await submitSamples({ status: "idle" }, form({ ...VALID, [SAMPLES_FIELDS.ids]: undefined }));
    expect(missing).toMatchObject({ status: "error", fieldErrors: { [SAMPLES_FIELDS.ids]: FORM_MESSAGES.samples } });

    expect((mocks.fake as FakeAdmin).inserts).toEqual([]);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("reads the limit from settings", async () => {
    mocks.settings = { ...SEED_SETTINGS, sample_limit: 2 };
    const state = await submitSamples({ status: "idle" }, form(VALID));
    expect(state).toMatchObject({ status: "error", fieldErrors: { [SAMPLES_FIELDS.ids]: "Poți alege cel mult 2 mostre." } });
  });

  it("requires the delivery address", async () => {
    const state = await submitSamples({ status: "idle" }, form({ ...VALID, address: "  " }));
    expect(state).toEqual({
      status: "error",
      message: FORM_MESSAGES.required,
      fieldErrors: { address: FORM_MESSAGES.required },
    });
  });

  it("sends both emails after the response and never lets a failure out", async () => {
    await submitSamples({ status: "idle" }, form(VALID));

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
    const state = await submitSamples({ status: "idle" }, fd);
    expect(state).toEqual({ status: "error", message: FORM_MESSAGES.generic });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
