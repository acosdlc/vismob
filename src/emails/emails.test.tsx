// @vitest-environment node
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import type { LeadRow } from "@/lib/leads/types";
import { LeadConfirmation, nextSteps } from "./LeadConfirmation";
import { LeadToWorkshop } from "./LeadToWorkshop";
import { DRAWING_ATTACHED_NOTE, formatDate, isReal, leadTicketRows, phoneDigits, PLAIN_TEXT_OPTIONS } from "./shared";

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
  message: "Aș vrea un pat capitonat,\nverde sticlă.",
  wants_measurement: true,
  config: null,
  config_code: null,
  price_estimate_ron: null,
  sample_material_ids: null,
  notes: null,
  source: null,
  ip_hash: null,
  consent_text: "Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.",
  consent_at: "2026-10-14T08:30:00.000Z",
  created_at: "2026-10-14T08:30:00.000Z",
};

const CONFIG_LEAD: LeadRow = {
  ...LEAD,
  kind: "configurator",
  config_code: "CAP-160x200-CT01-H120-LD-LED",
  city: null,
  mattress_size: null,
  message: null,
  wants_measurement: false,
};

const ROWS = [
  { k: "Model", v: "Capitonat" },
  { k: "Saltea", v: "160 × 200 cm" },
];

describe("LeadToWorkshop", () => {
  it("renders the client's name, phone (tel:), email, city, size, measurements and message", async () => {
    const html = await render(
      <LeadToWorkshop
        lead={LEAD}
        workshopName="[Nume atelier]"
        photoUrls={["https://storage.example/a.jpg?t=1", "https://storage.example/b.jpg?t=2"]}
      />,
    );
    expect(html).toContain("Ștefan Țăranu");
    expect(html).toContain("+40722123456");
    expect(html).toContain('href="tel:+40722123456"');
    expect(html).toContain('href="mailto:stefan@example.com"');
    expect(html).toContain("Timișoara");
    expect(html).toContain("160 × 200 cm");
    expect(html).toContain("Cerere de ofertă");
    expect(html).toContain('href="https://wa.me/40722123456"');
    expect(html).toContain('href="https://storage.example/a.jpg?t=1"');
    expect(html).toContain("Poza 2");
    expect(html).toContain("Linkurile sunt valabile 7 zile.");
    expect(html).toContain("[Nume atelier]");
    expect(html).not.toContain("Deschide configurația");
    expect(html).not.toContain("Fișă de configurare");

    const text = await render(
      <LeadToWorkshop lead={LEAD} workshopName="[Nume atelier]" photoUrls={[]} />,
      PLAIN_TEXT_OPTIONS,
    );
    expect(text).toContain("Măsurători");
    expect(text).toMatch(/Măsurători\s+da/);
    expect(text).toContain("Aș vrea un pat capitonat");
    expect(text).not.toContain("Poze");
  });

  it("adds the configuration ticket, the price row and the share link for a configurator lead", async () => {
    const html = await render(
      <LeadToWorkshop
        lead={CONFIG_LEAD}
        workshopName="Atelier"
        photoUrls={[]}
        ticketRows={ROWS}
        shareUrl="https://domeniu.ro/configurator?m=cap"
        priceLabel="7.450 lei"
      />,
    );
    expect(html).toContain("Configurator");
    expect(html).toContain("CAP-160x200-CT01-H120-LD-LED");
    expect(html).toContain("Fișă de configurare");
    expect(html).toContain("Capitonat");
    expect(html).toContain("Preț orientativ");
    expect(html).toContain("7.450 lei");
    expect(html).toContain('href="https://domeniu.ro/configurator?m=cap"');
    expect(html).toContain("Deschide configurația");
    expect(html).toMatch(/Măsurători<\/td><td[^>]*>nu/);
  });
});

describe("drawingAttached", () => {
  it("names the attached drawing in both emails only when asked", async () => {
    const base = { lead: CONFIG_LEAD, workshopName: "Atelier", ticketRows: ROWS };
    const workshopWith = await render(<LeadToWorkshop {...base} photoUrls={[]} drawingAttached />);
    const workshopWithout = await render(<LeadToWorkshop {...base} photoUrls={[]} />);
    const client = { ...base, responseTime: "24 de ore", phonePublic: "[07xx]", emailPublic: "[email]" };
    const clientWith = await render(<LeadConfirmation {...client} drawingAttached />);
    const clientWithout = await render(<LeadConfirmation {...client} />);
    expect(DRAWING_ATTACHED_NOTE).toBe("Desenul la scară e atașat ca PNG.");
    expect(workshopWith).toContain(DRAWING_ATTACHED_NOTE);
    expect(clientWith).toContain(DRAWING_ATTACHED_NOTE);
    expect(workshopWithout).not.toContain(DRAWING_ATTACHED_NOTE);
    expect(clientWithout).not.toContain(DRAWING_ATTACHED_NOTE);
  });
});

describe("LeadConfirmation", () => {
  it("thanks the client, lists the three steps, the ticket and the workshop's contact", async () => {
    const html = await render(
      <LeadConfirmation
        lead={LEAD}
        workshopName="[Nume atelier]"
        responseTime="[24 de ore]"
        phonePublic="[07xx xxx xxx]"
        emailPublic="[contact@domeniu.ro]"
      />,
    );
    expect(html).toContain("Cerere trimisă");
    expect(html).toContain("Mulțumim! Te sunăm în [24 de ore].");
    expect(html).toContain("Te sunăm în [24 de ore] să clarificăm detaliile.");
    expect(html).toContain("Venim la măsurători sau confirmăm dimensiunile cu tine.");
    expect(html).toContain("Primești desenul final și prețul, în scris.");
    expect(html).toContain("Ștefan Țăranu");
    expect(html).toContain("+40722123456");
    expect(html).toContain("[Nume atelier]");
    // Placeholders are shown as text, never as broken links.
    expect(html).toContain("[07xx xxx xxx]");
    expect(html).not.toContain("tel:[07xx");
    expect(html).not.toContain("mailto:[contact");
  });

  it("links the real contact, names the code and the share link for a configurator lead", async () => {
    const html = await render(
      <LeadConfirmation
        lead={CONFIG_LEAD}
        workshopName="Atelier"
        responseTime="24 de ore"
        ticketRows={ROWS}
        shareUrl="https://domeniu.ro/configurator?m=cap"
        phonePublic="0722 123 456"
        emailPublic="contact@atelier.ro"
      />,
    );
    expect(html).toContain("Configurație trimisă · CAP-160x200-CT01-H120-LD-LED");
    expect(html).toContain("Fișă de configurare");
    expect(html).toContain('href="tel:0722123456"');
    expect(html).toContain('href="mailto:contact@atelier.ro"');
    expect(html).toContain("Deschide configurația");
    expect(html).toContain('lang="ro"');
  });

  it("builds the three DESIGN §4.2 steps around the response time", () => {
    expect(nextSteps("24 de ore")).toEqual([
      "Te sunăm în 24 de ore să clarificăm detaliile.",
      "Venim la măsurători sau confirmăm dimensiunile cu tine.",
      "Primești desenul final și prețul, în scris.",
    ]);
  });
});

describe("shared helpers", () => {
  it("builds the ticket rows from the lead, skipping empty optional fields", () => {
    const keys = leadTicketRows(LEAD).map((r) => r.k);
    expect(keys).toEqual(["Nume", "Telefon", "Email", "Localitate", "Saltea", "Măsurători", "Mesaj"]);
    expect(leadTicketRows(CONFIG_LEAD).map((r) => r.k)).toEqual(["Nume", "Telefon", "Email", "Măsurători"]);
    expect(leadTicketRows({ ...LEAD, address: "Str. Lungă 1" }).map((r) => r.k)).toContain("Adresă");
  });

  it("tells placeholders from real values and keeps only digits of a phone", () => {
    expect(isReal("[contact@domeniu.ro]")).toBe(false);
    expect(isReal("")).toBe(false);
    expect(isReal("contact@atelier.ro")).toBe(true);
    expect(phoneDigits("+40 722-123.456")).toBe("40722123456");
  });

  it("formats dates in Romanian, in Romania's time zone", () => {
    expect(formatDate("2026-10-14T08:30:00.000Z")).toBe("14 octombrie 2026, 11:30");
    expect(formatDate("not a date")).toBe("");
  });
});
