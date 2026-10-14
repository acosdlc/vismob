// @vitest-environment node
import { render } from "@react-email/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SampleItem } from "@/components/materials/types";
import type { LeadRow } from "@/lib/leads/types";
import { PLAIN_TEXT_OPTIONS } from "./shared";
import { clientSampleRows, SamplesConfirmation } from "./SamplesConfirmation";
import { sampleRows, SamplesToWorkshop, SUPPLIER_CODE_PLACEHOLDER } from "./SamplesToWorkshop";

const LEAD: LeadRow = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "mostre",
  status: "nou",
  name: "Ștefan Țăranu",
  phone: "+40722123456",
  email: "stefan@example.com",
  city: null,
  address: "Str. Lungă 1, ap. 3\n400001 Cluj-Napoca",
  mattress_size: null,
  message: null,
  wants_measurement: false,
  config: null,
  config_code: null,
  price_estimate_ron: null,
  sample_material_ids: ["ct-verde", "bc-nisip"],
  notes: null,
  source: null,
  ip_hash: null,
  consent_text: "Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.",
  consent_at: "2026-10-14T08:30:00.000Z",
  created_at: "2026-10-14T08:30:00.000Z",
};

const ITEMS: SampleItem[] = [
  { id: "ct-verde", name: "Verde sticlă", code: "CT01", hex: "#2F4B3C", familyId: "catifea", familyName: "Catifea" },
  {
    id: "bc-nisip",
    name: "Nisip",
    code: "BC02",
    hex: "#CDBFA6",
    familyId: "boucle",
    familyName: "Bouclé",
    supplierCode: "KV-4471",
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SamplesToWorkshop", () => {
  it("lists the codes with the names and supplier codes, the address, the phone and the email", async () => {
    const html = await render(<SamplesToWorkshop lead={LEAD} items={ITEMS} workshopName="[Nume atelier]" />);
    expect(html).toContain("Mostre de trimis · 2 buc.");
    expect(html).toContain("CT01");
    expect(html).toContain("Catifea, Verde sticlă · [cod furnizor]");
    expect(html).toContain("BC02");
    expect(html).toContain("Bouclé, Nisip · KV-4471");
    expect(html).toContain("Str. Lungă 1, ap. 3");
    expect(html).toContain("400001 Cluj-Napoca");
    expect(html).toContain('href="tel:+40722123456"');
    expect(html).toContain('href="mailto:stefan@example.com"');
    expect(html).toContain("Ștefan Țăranu");
    expect(html).toContain("[Nume atelier]");
    expect(html).toContain('lang="ro"');
    // The preview line is the subject.
    expect(html).toContain("Mostre de trimis · 2 buc. · Ștefan Țăranu");
  });

  it("renders the same content as plain text", async () => {
    const text = await render(<SamplesToWorkshop lead={LEAD} items={ITEMS} workshopName="Atelier" />, PLAIN_TEXT_OPTIONS);
    expect(text).toMatch(/CT01\s+Catifea, Verde sticlă · \[cod furnizor\]/);
    expect(text).toMatch(/BC02\s+Bouclé, Nisip · KV-4471/);
    expect(text).toContain("Str. Lungă 1, ap. 3");
    expect(text).toContain("+40722123456");
    expect(text).toContain("stefan@example.com");
  });

  it("builds one row per sample with the placeholder when the supplier code is missing", () => {
    expect(sampleRows(ITEMS)).toEqual([
      { k: "CT01", v: `Catifea, Verde sticlă · ${SUPPLIER_CODE_PLACEHOLDER}` },
      { k: "BC02", v: "Bouclé, Nisip · KV-4471" },
    ]);
    expect(SUPPLIER_CODE_PLACEHOLDER).toBe("[cod furnizor]");
  });
});

describe("SamplesConfirmation", () => {
  it("names the samples and families, the delivery note, the call and the workshop's contact", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.vismob.dev");
    const html = await render(
      <SamplesConfirmation
        lead={LEAD}
        items={ITEMS}
        workshopName="[Nume atelier]"
        samplesDelivery="[2–3 zile lucrătoare]"
        samplesFree="[gratuit]"
        phonePublic="[07xx xxx xxx]"
        emailPublic="[contact@domeniu.ro]"
      />,
    );
    expect(html).toContain("Pregătim mostrele tale");
    expect(html).toContain("Gata! Pregătim cutia.");
    expect(html).toContain("Te sunăm să confirmăm adresa.");
    expect(html).toContain("Verde sticlă · Catifea");
    expect(html).toContain("Nisip · Bouclé");
    expect(html).toContain("Livrare prin curier în [2–3 zile lucrătoare]. [Gratuit].");
    expect(html).toContain("Str. Lungă 1, ap. 3");
    expect(html).toContain('href="https://www.vismob.dev/configurator"');
    expect(html).toContain("[Nume atelier]");
    // Placeholders are shown as text, never as broken links.
    expect(html).toContain("[07xx xxx xxx]");
    expect(html).not.toContain("tel:[07xx");
    expect(html).not.toContain("mailto:[contact");
  });

  it("links the real contact and renders as plain text too", async () => {
    const html = await render(
      <SamplesConfirmation
        lead={LEAD}
        items={ITEMS}
        workshopName="Atelier"
        samplesDelivery="2–3 zile lucrătoare"
        samplesFree="gratuit"
        phonePublic="0722 123 456"
        emailPublic="contact@atelier.ro"
      />,
    );
    expect(html).toContain('href="tel:0722123456"');
    expect(html).toContain('href="mailto:contact@atelier.ro"');

    const text = await render(
      <SamplesConfirmation
        lead={LEAD}
        items={ITEMS}
        workshopName="Atelier"
        samplesDelivery="2–3 zile lucrătoare"
        samplesFree="gratuit"
      />,
      PLAIN_TEXT_OPTIONS,
    );
    expect(text).toContain("Livrare prin curier în 2–3 zile lucrătoare. Gratuit.");
    expect(text).toMatch(/CT01\s+Verde sticlă · Catifea/);
    expect(text).toContain("Str. Lungă 1, ap. 3");
    expect(text).not.toContain("Telefon");
  });

  it("formats the rows", () => {
    expect(clientSampleRows(ITEMS)).toEqual([
      { k: "CT01", v: "Verde sticlă · Catifea" },
      { k: "BC02", v: "Nisip · Bouclé" },
    ]);
  });
});
