// @vitest-environment node
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadRow } from "@/lib/leads/types";
import { DEFAULT_CONFIG } from "@/lib/configurator/catalog.seed";
import type { Config } from "@/lib/configurator/types";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";
import type { Json } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getSettings: vi.fn(),
  createAdminClient: vi.fn(),
  admin: null as unknown,
}));
vi.mock("./email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/data/settings", () => ({ getSettings: mocks.getSettings }));
// getCatalog is a "use cache" reader: cacheTag() throws outside Next, so the seed stands in.
vi.mock("@/lib/data/catalog", async () => ({ getCatalog: async () => (await import("@/lib/configurator/catalog.seed")).SEED_CATALOG }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { SamplesConfirmation } from "@/emails/SamplesConfirmation";
import { SamplesToWorkshop } from "@/emails/SamplesToWorkshop";
import { LeadConfirmation } from "@/emails/LeadConfirmation";
import { LeadToWorkshop } from "@/emails/LeadToWorkshop";
import type { SampleItem } from "@/components/materials/types";
import { dispatchLeadNotifications, PHOTO_LINK_SECONDS, sampleItemsFor } from "./dispatch";

/** Config is an interface (no index signature): the column type needs the cast, as in the action. */
const asJson = (config: Config) => config as unknown as Json;

const LEAD: LeadRow = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "contact",
  status: "nou",
  name: "Ștefan Țăranu",
  phone: "+40722123456",
  email: "stefan@example.com",
  city: "Timișoara",
  address: null,
  mattress_size: "160 × 200 cm",
  message: "Aș vrea un pat capitonat, verde.",
  wants_measurement: true,
  config: null,
  config_code: null,
  price_estimate_ron: null,
  sample_material_ids: null,
  notes: null,
  source: { page: "/contact", environment: "preview" },
  ip_hash: "abc",
  consent_text: "Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.",
  consent_at: "2026-10-14T08:30:00.000Z",
  created_at: "2026-10-14T08:30:00.000Z",
};

interface EventRow {
  lead_id: string;
  type: string;
  ok: boolean;
  detail: Record<string, unknown>;
}

function fakeAdmin(options: { lead?: LeadRow | null; files?: { path: string }[]; signError?: boolean } = {}) {
  const events: EventRow[] = [];
  const signed: { path: string; expiresIn: number }[] = [];
  const admin = {
    events,
    signed,
    from(table: string) {
      if (table === "leads") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: options.lead === undefined ? LEAD : options.lead, error: null }),
            }),
          }),
        };
      }
      if (table === "lead_files") {
        return { select: () => ({ eq: async () => ({ data: options.files ?? [], error: null }) }) };
      }
      if (table === "lead_events") {
        return {
          insert: async (row: EventRow) => {
            events.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number) => {
          signed.push({ path, expiresIn });
          if (options.signError) return { data: null, error: { message: "boom" } };
          return { data: { signedUrl: `https://storage.example/${bucket}/${path}?token=x` }, error: null };
        },
      }),
    },
  };
  return admin;
}

type SentCall = {
  to: string;
  subject: string;
  react: ReactElement<Record<string, unknown>>;
  replyTo?: string;
};
const sent = () => mocks.sendEmail.mock.calls.map((c) => c[0] as SentCall);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NOTIFY_EMAIL", "atelier-preview@example.com");
  mocks.sendEmail.mockReset();
  mocks.sendEmail.mockResolvedValue({ ok: true, id: "re_1" });
  mocks.getSettings.mockReset();
  mocks.getSettings.mockResolvedValue(SEED_SETTINGS);
  mocks.createAdminClient.mockReset();
  mocks.createAdminClient.mockImplementation(() => mocks.admin);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("dispatchLeadNotifications", () => {
  it("sends the workshop email (reply-to the client) then the confirmation, and records both", async () => {
    const admin = fakeAdmin({ files: [{ path: `${LEAD.id}/1.jpg` }, { path: `${LEAD.id}/2.jpg` }] });
    mocks.admin = admin;

    await dispatchLeadNotifications(LEAD.id);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    const [workshop, client] = sent();

    expect(workshop.to).toBe("atelier-preview@example.com");
    expect(workshop.replyTo).toBe("stefan@example.com");
    expect(workshop.subject).toBe("Cerere nouă · Ștefan Țăranu, Timișoara");
    expect(workshop.react.props.photoUrls).toEqual([
      `https://storage.example/lead-uploads/${LEAD.id}/1.jpg?token=x`,
      `https://storage.example/lead-uploads/${LEAD.id}/2.jpg?token=x`,
    ]);
    expect(workshop.react.props.workshopName).toBe(SEED_SETTINGS.workshop_name);
    expect(admin.signed.every((s) => s.expiresIn === PHOTO_LINK_SECONDS)).toBe(true);
    expect(PHOTO_LINK_SECONDS).toBe(7 * 24 * 3600);

    expect(client.to).toBe("stefan@example.com");
    // The seed's email_public is a [placeholder], so the workshop's NOTIFY_EMAIL is the reply-to.
    expect(client.replyTo).toBe("atelier-preview@example.com");
    expect(client.subject).toBe("Am primit cererea ta");
    expect(client.react.props.responseTime).toBe(SEED_SETTINGS.response_time);
    expect(client.react.props.phonePublic).toBe(SEED_SETTINGS.phone_public);

    expect(admin.events).toEqual([
      { lead_id: LEAD.id, type: "email_workshop", ok: true, detail: { id: "re_1" } },
      { lead_id: LEAD.id, type: "email_client", ok: true, detail: { id: "re_1" } },
    ]);
  });

  it("gives both emails the ticket rows, the share link and the price of a configurator lead", async () => {
    const config = { ...DEFAULT_CONFIG, base: "lada" as const, led: true };
    mocks.admin = fakeAdmin({
      lead: {
        ...LEAD,
        kind: "configurator",
        mattress_size: null,
        config: asJson(config),
        config_code: "CAP-160x200-CT01-H120-LD-LED",
        price_estimate_ron: 7450,
      },
    });

    await dispatchLeadNotifications(LEAD.id);

    const [workshop, client] = sent();
    expect(workshop.subject).toBe("Cerere nouă · CAP-160x200-CT01-H120-LD-LED · Ștefan Țăranu, Timișoara");
    const rows = workshop.react.props.ticketRows as { k: string; v: string }[];
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ k: "Model", v: "Capitonat" });
    expect(rows[5]).toEqual({ k: "Extra", v: "LED sub pat" });
    expect(workshop.react.props.shareUrl).toContain("/configurator?m=capitonat");
    expect(workshop.react.props.shareUrl).toContain("b=lada&led=1");
    expect(workshop.react.props.priceLabel).toBe("7.450 lei");

    expect(client.subject).toBe("Am primit cererea ta · CAP-160x200-CT01-H120-LD-LED");
    expect(client.react.props.ticketRows).toEqual(rows);
    expect(client.react.props.shareUrl).toBe(workshop.react.props.shareUrl);
  });

  it("leaves the price out when none was stored and the rows out of a contact lead", async () => {
    mocks.admin = fakeAdmin({
      lead: { ...LEAD, kind: "configurator", config: asJson(DEFAULT_CONFIG), config_code: "CAP-160x200-CT01-H120-PL" },
    });
    await dispatchLeadNotifications(LEAD.id);
    expect(sent()[0].react.props.priceLabel).toBeUndefined();
    expect(sent()[0].react.props.ticketRows).toHaveLength(6);

    mocks.sendEmail.mockClear();
    mocks.admin = fakeAdmin();
    await dispatchLeadNotifications(LEAD.id);
    expect(sent()[0].react.props.ticketRows).toBeUndefined();
    expect(sent()[0].react.props.shareUrl).toBeUndefined();
    expect(sent()[1].react.props.ticketRows).toBeUndefined();
  });

  it("still sends a configurator lead whose config is missing, without the rows", async () => {
    mocks.admin = fakeAdmin({ lead: { ...LEAD, kind: "configurator", config: null, config_code: "CAP-160x200-CT01-H120-PL" } });
    await dispatchLeadNotifications(LEAD.id);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(sent()[0].react.props.ticketRows).toBeUndefined();
  });

  it("replies to the workshop's public address once it is a real one", async () => {
    mocks.admin = fakeAdmin();
    mocks.getSettings.mockResolvedValue({ ...SEED_SETTINGS, email_public: "contact@atelier.ro" });
    await dispatchLeadNotifications(LEAD.id);
    expect(sent()[1].replyTo).toBe("contact@atelier.ro");
  });

  it("records a failed workshop event and still confirms to the client when NOTIFY_EMAIL is missing", async () => {
    vi.stubEnv("NOTIFY_EMAIL", "");
    const admin = fakeAdmin();
    mocks.admin = admin;

    await dispatchLeadNotifications(LEAD.id);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(sent()[0].to).toBe("stefan@example.com");
    expect(sent()[0].replyTo).toBeUndefined();
    expect(admin.events).toEqual([
      { lead_id: LEAD.id, type: "email_workshop", ok: false, detail: { error: "NOTIFY_EMAIL missing" } },
      { lead_id: LEAD.id, type: "email_client", ok: true, detail: { id: "re_1" } },
    ]);
  });

  it("records dry runs and send errors without throwing", async () => {
    const admin = fakeAdmin();
    mocks.admin = admin;
    mocks.sendEmail
      .mockResolvedValueOnce({ ok: true, dryRun: true })
      .mockResolvedValueOnce({ ok: false, error: "validation_error: Invalid `to` field" });

    await expect(dispatchLeadNotifications(LEAD.id)).resolves.toBeUndefined();

    expect(admin.events).toEqual([
      { lead_id: LEAD.id, type: "email_workshop", ok: true, detail: { dryRun: true } },
      { lead_id: LEAD.id, type: "email_client", ok: false, detail: { error: "validation_error: Invalid `to` field" } },
    ]);
  });

  it("survives a throwing sender and an unsignable photo", async () => {
    const admin = fakeAdmin({ files: [{ path: `${LEAD.id}/1.jpg` }], signError: true });
    mocks.admin = admin;
    mocks.sendEmail.mockRejectedValueOnce(new Error("network down"));

    await expect(dispatchLeadNotifications(LEAD.id)).resolves.toBeUndefined();

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(sent()[0].react.props.photoUrls).toEqual([]);
    expect(admin.events[0]).toMatchObject({ type: "email_workshop", ok: false });
    expect(String(admin.events[0].detail.error)).toContain("network down");
    expect(admin.events[1]).toMatchObject({ type: "email_client", ok: true });
  });

  it("does nothing when the lead is missing or the admin client cannot be created", async () => {
    const admin = fakeAdmin({ lead: null });
    mocks.admin = admin;
    await expect(dispatchLeadNotifications(LEAD.id)).resolves.toBeUndefined();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(admin.events).toEqual([]);

    mocks.createAdminClient.mockImplementationOnce(() => {
      throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
    });
    await expect(dispatchLeadNotifications(LEAD.id)).resolves.toBeUndefined();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("sends SamplesToWorkshop and SamplesConfirmation for a samples lead, with the resolved items in order", async () => {
    const lead: LeadRow = {
      ...LEAD,
      kind: "mostre",
      mattress_size: null,
      message: null,
      wants_measurement: false,
      address: "Str. Lungă 1, Cluj",
      sample_material_ids: ["bc-nisip", "ct-verde", "lm-nuc"],
    };
    const admin = fakeAdmin({ lead });
    mocks.admin = admin;

    await dispatchLeadNotifications(lead.id);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    const [workshop, client] = sent();

    expect(workshop.to).toBe("atelier-preview@example.com");
    expect(workshop.replyTo).toBe("stefan@example.com");
    expect(workshop.subject).toBe("Mostre de trimis · 3 buc. · Ștefan Țăranu, Timișoara");
    expect(workshop.react.type).toBe(SamplesToWorkshop);
    const items = workshop.react.props.items as SampleItem[];
    expect(items.map((i) => i.code)).toEqual(["BC02", "CT01", "LM03"]);
    expect(items[0]).toEqual({
      id: "bc-nisip",
      name: "Nisip",
      code: "BC02",
      hex: "#CDBFA6",
      familyId: "boucle",
      familyName: "Bouclé",
      supplierCode: undefined,
      photoSrc: undefined,
    });
    expect((workshop.react.props.lead as LeadRow).address).toBe("Str. Lungă 1, Cluj");
    expect(workshop.react.props.workshopName).toBe(SEED_SETTINGS.workshop_name);

    expect(client.to).toBe("stefan@example.com");
    expect(client.replyTo).toBe("atelier-preview@example.com");
    expect(client.subject).toBe("Pregătim mostrele tale");
    expect(client.react.type).toBe(SamplesConfirmation);
    expect(client.react.props.items).toEqual(items);
    expect(client.react.props.samplesDelivery).toBe(SEED_SETTINGS.samples_delivery);
    expect(client.react.props.samplesFree).toBe(SEED_SETTINGS.samples_free);
    expect(client.react.props.phonePublic).toBe(SEED_SETTINGS.phone_public);
    expect(client.react.props.emailPublic).toBe(SEED_SETTINGS.email_public);

    expect(admin.events).toEqual([
      { lead_id: LEAD.id, type: "email_workshop", ok: true, detail: { id: "re_1" } },
      { lead_id: LEAD.id, type: "email_client", ok: true, detail: { id: "re_1" } },
    ]);
  });

  it("skips sample ids the catalogue no longer knows, and still sends", async () => {
    const lead: LeadRow = { ...LEAD, kind: "mostre", sample_material_ids: ["nope", "ct-verde", "gone"] };
    mocks.admin = fakeAdmin({ lead });
    await dispatchLeadNotifications(lead.id);
    const [workshop, client] = sent();
    expect((workshop.react.props.items as SampleItem[]).map((i) => i.id)).toEqual(["ct-verde"]);
    expect((client.react.props.items as SampleItem[]).map((i) => i.id)).toEqual(["ct-verde"]);
    // The subject counts what the workshop will actually find in the email.
    expect(workshop.subject).toBe("Mostre de trimis · 1 buc. · Ștefan Țăranu, Timișoara");

    expect(await sampleItemsFor({ ...lead, sample_material_ids: null })).toEqual([]);
    expect(await sampleItemsFor(LEAD)).toEqual([]);
  });

  it("keeps the contact and configurator emails on their own components", async () => {
    mocks.admin = fakeAdmin();
    await dispatchLeadNotifications(LEAD.id);
    expect(sent()[0].react.type).toBe(LeadToWorkshop);
    expect(sent()[1].react.type).toBe(LeadConfirmation);
  });

  it("records both emails as failed when something breaks before they are sent", async () => {
    const admin = fakeAdmin();
    mocks.admin = admin;
    mocks.getSettings.mockRejectedValueOnce(new Error("settings unavailable"));

    await expect(dispatchLeadNotifications(LEAD.id)).resolves.toBeUndefined();

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(admin.events).toEqual([
      { lead_id: LEAD.id, type: "email_workshop", ok: false, detail: { error: "settings unavailable" } },
      { lead_id: LEAD.id, type: "email_client", ok: false, detail: { error: "settings unavailable" } },
    ]);
  });
});
