// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/configurator/catalog.seed";
import type { Config } from "@/lib/configurator/types";
import type { LeadRow } from "@/lib/leads/types";
import {
  applyLeadFilters,
  DEFAULT_LEAD_FILTERS,
  formatLeadDate,
  hasLeadFilters,
  leadConfig,
  leadCountLabel,
  leadSourceText,
  leadTicketRows,
  parseLeadFilters,
  periodStart,
  phoneSearchDigits,
  sanitizeSearch,
  whatsappHref,
  zodFieldErrors,
  type LeadQuery,
} from "./leads";

const NOW = new Date("2026-10-21T10:00:00.000Z");

/** Records the chain the filters build; every method returns the same fake. */
function fakeQuery() {
  const calls: [method: string, ...args: string[]][] = [];
  const q: LeadQuery & { calls: typeof calls } = {
    calls,
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    gte(column, value) {
      calls.push(["gte", column, value]);
      return this;
    },
    or(filters) {
      calls.push(["or", filters]);
      return this;
    },
  };
  return q;
}

describe("parseLeadFilters", () => {
  it("returns the defaults for an empty query: all kinds, all statuses, all time, no search", () => {
    expect(parseLeadFilters({})).toEqual(DEFAULT_LEAD_FILTERS);
    expect(hasLeadFilters(parseLeadFilters({}))).toBe(false);
  });

  it("reads tip, status, perioada and q", () => {
    const filters = parseLeadFilters({ tip: "configurator", status: "ofertat", perioada: "30", q: "  ana  " });
    expect(filters).toEqual({ kind: "configurator", status: "ofertat", period: "30", q: "ana" });
    expect(hasLeadFilters(filters)).toBe(true);
  });

  it("drops unknown values and keeps the defaults", () => {
    const filters = parseLeadFilters({ tip: "mostre", status: "deleted", perioada: "365", q: undefined });
    expect(filters).toEqual(DEFAULT_LEAD_FILTERS);
  });

  it("takes the first value of a repeated key and bounds the search to 80 characters", () => {
    const filters = parseLeadFilters({ tip: ["contact", "configurator"], q: ["x".repeat(100), "y"] });
    expect(filters.kind).toBe("contact");
    expect(filters.q).toHaveLength(80);
  });

  it("counts a period alone as a filter", () => {
    expect(hasLeadFilters(parseLeadFilters({ perioada: "7" }))).toBe(true);
    expect(hasLeadFilters(parseLeadFilters({ perioada: "all" }))).toBe(false);
  });
});

describe("periodStart", () => {
  it("is null for all time and now minus the days otherwise", () => {
    expect(periodStart("all", NOW)).toBeNull();
    expect(periodStart("7", NOW)).toBe("2026-10-14T10:00:00.000Z");
    expect(periodStart("30", NOW)).toBe("2026-09-21T10:00:00.000Z");
    expect(periodStart("90", NOW)).toBe("2026-07-23T10:00:00.000Z");
  });
});

describe("applyLeadFilters", () => {
  it("chains nothing for the defaults", () => {
    const q = fakeQuery();
    expect(applyLeadFilters(q, DEFAULT_LEAD_FILTERS, NOW)).toBe(q);
    expect(q.calls).toEqual([]);
  });

  it("chains eq, eq, gte and the ilike or-filter over name, email, phone and config_code", () => {
    const q = fakeQuery();
    applyLeadFilters(q, { kind: "contact", status: "nou", period: "7", q: "Ana" }, NOW);
    expect(q.calls).toEqual([
      ["eq", "kind", "contact"],
      ["eq", "status", "nou"],
      ["gte", "created_at", "2026-10-14T10:00:00.000Z"],
      ["or", "name.ilike.%Ana%,email.ilike.%Ana%,phone.ilike.%Ana%,config_code.ilike.%Ana%"],
    ]);
  });

  it("strips the characters PostgREST's or-syntax reads from the search", () => {
    expect(sanitizeSearch("a,b(c)d%e\\f")).toBe("abcdef");
    const q = fakeQuery();
    applyLeadFilters(q, { period: "all", q: "pop,ana(x)%" }, NOW);
    expect(q.calls).toEqual([["or", "name.ilike.%popanax%,email.ilike.%popanax%,phone.ilike.%popanax%,config_code.ilike.%popanax%"]]);
  });

  it("skips the search when nothing is left after sanitising", () => {
    const q = fakeQuery();
    applyLeadFilters(q, { period: "all", q: ",,%" }, NOW);
    expect(q.calls).toEqual([]);
  });

  it("keeps dots, so an email address can be searched", () => {
    const q = fakeQuery();
    applyLeadFilters(q, { period: "all", q: "ana@example.com" }, NOW);
    expect(q.calls[0][1]).toContain("email.ilike.%ana@example.com%");
  });

  it("also searches a phone typed with the trunk 0 as the digits stored in E.164", () => {
    const q = fakeQuery();
    applyLeadFilters(q, { period: "all", q: "0722123456" }, NOW);
    expect(q.calls).toEqual([
      [
        "or",
        "name.ilike.%0722123456%,email.ilike.%0722123456%,phone.ilike.%0722123456%,config_code.ilike.%0722123456%,phone.ilike.%722123456%",
      ],
    ]);

    const spaced = fakeQuery();
    applyLeadFilters(spaced, { period: "all", q: "0722 123 456" }, NOW);
    expect(spaced.calls[0][1]).toContain(",phone.ilike.%722123456%");

    const name = fakeQuery();
    applyLeadFilters(name, { period: "all", q: "Ana" }, NOW);
    expect(name.calls[0][1]).not.toContain(",phone.ilike.%na%");
  });
});

describe("phoneSearchDigits", () => {
  it("drops the trunk 0 and the spaces of a national number, and is null for anything else", () => {
    expect(phoneSearchDigits("0722123456")).toBe("722123456");
    expect(phoneSearchDigits("0722 123 456")).toBe("722123456");
    expect(phoneSearchDigits("+40722123456")).toBeNull();
    expect(phoneSearchDigits("722123456")).toBeNull();
    expect(phoneSearchDigits("07")).toBeNull();
    expect(phoneSearchDigits("Ana Pop")).toBeNull();
    expect(phoneSearchDigits("CAP-160x200")).toBeNull();
  });
});

describe("leadConfig", () => {
  it("turns the stored object back into the Config", () => {
    expect(leadConfig({ config: { ...DEFAULT_CONFIG } })).toEqual(DEFAULT_CONFIG);
  });

  it("keeps a custom size with its measurements, led and nightstands", () => {
    const custom: Config = {
      model: "lamele",
      size: "custom",
      customW: 185,
      customL: 210,
      family: "lemn",
      color: "lm-nuc",
      hb: 140,
      base: "sertare",
      led: true,
      nightstands: true,
    };
    expect(leadConfig({ config: { ...custom } })).toEqual(custom);
  });

  it("falls back to the defaults for missing or odd values and lets resolve() repair the rest", () => {
    const config = leadConfig({ config: { model: "canale", hb: "abc", led: "yes", extra: 1 } });
    expect(config).toEqual({ ...DEFAULT_CONFIG, model: "canale" });
  });

  it("is null when config is not an object", () => {
    expect(leadConfig({ config: null })).toBeNull();
    expect(leadConfig({ config: "CAP-160x200" })).toBeNull();
    expect(leadConfig({ config: [1, 2] })).toBeNull();
    expect(leadConfig({ config: 3 })).toBeNull();
  });
});

const LEAD: Pick<LeadRow, "name" | "phone" | "email" | "city" | "address" | "mattress_size" | "wants_measurement" | "message"> = {
  name: "Ana Pop",
  phone: "+40722123456",
  email: "ana@example.com",
  city: "Cluj",
  address: null,
  mattress_size: "160 × 200 cm",
  wants_measurement: true,
  message: "Vreau un pat cu ladă.",
};

describe("leadTicketRows", () => {
  it("lists the contact, the city, the mattress, measurements and the message as plain strings", () => {
    expect(leadTicketRows(LEAD)).toEqual([
      { k: "Nume", v: "Ana Pop" },
      { k: "Telefon", v: "+40722123456" },
      { k: "Email", v: "ana@example.com" },
      { k: "Localitate", v: "Cluj" },
      { k: "Saltea", v: "160 × 200 cm" },
      { k: "Măsurători", v: "da" },
      { k: "Mesaj", v: "Vreau un pat cu ladă." },
    ]);
  });

  it("skips the empty optional rows and says „nu” for no measurements", () => {
    const rows = leadTicketRows({ ...LEAD, city: null, mattress_size: null, message: null, wants_measurement: false, address: "Str. X 1" });
    expect(rows.map((r) => r.k)).toEqual(["Nume", "Telefon", "Email", "Adresă", "Măsurători"]);
    expect(rows.at(-1)).toEqual({ k: "Măsurători", v: "nu" });
  });
});

describe("formatLeadDate", () => {
  it("formats in Romanian, medium date and short time, in Europe/Bucharest", () => {
    expect(formatLeadDate("2026-10-14T07:32:00.000Z")).toBe("14 oct. 2026, 10:32");
    // Winter: UTC+2.
    expect(formatLeadDate("2026-01-05T22:15:00.000Z")).toBe("6 ian. 2026, 00:15");
  });

  it("is empty for an unreadable timestamp", () => {
    expect(formatLeadDate("nu")).toBe("");
  });
});

describe("leadCountLabel", () => {
  it("agrees in Romanian", () => {
    expect(leadCountLabel(0)).toBe("0 cereri");
    expect(leadCountLabel(1)).toBe("1 cerere");
    expect(leadCountLabel(19)).toBe("19 cereri");
    expect(leadCountLabel(20)).toBe("20 de cereri");
    expect(leadCountLabel(200)).toBe("200 de cereri");
  });
});

describe("whatsappHref", () => {
  it("keeps the digits and hides the button under 8 of them", () => {
    expect(whatsappHref("+40 722 123 456")).toBe("https://wa.me/40722123456");
    expect(whatsappHref("0722")).toBeNull();
  });
});

describe("leadSourceText", () => {
  it("joins the page, the utm pairs and the referrer, and reads the environment", () => {
    expect(
      leadSourceText({
        page: "/contact",
        environment: "production",
        referrer: "https://www.google.com/",
        utm: { utm_source: "instagram", utm_campaign: "" },
      }),
    ).toEqual({ source: "/contact · utm_source=instagram · de pe https://www.google.com/", environment: "production" });
  });

  it("is empty for a missing or malformed source", () => {
    expect(leadSourceText(null)).toEqual({ source: null, environment: null });
    expect(leadSourceText("x")).toEqual({ source: null, environment: null });
    expect(leadSourceText({ page: "", utm: [1] })).toEqual({ source: null, environment: null });
  });
});

describe("zodFieldErrors", () => {
  it("keeps the first message per field and uses the fallback for an empty one", () => {
    const errors = zodFieldErrors(
      [
        { path: ["notes"], message: "Prea lung" },
        { path: ["notes"], message: "Altceva" },
        { path: ["status"], message: "" },
        { path: [], message: "fără câmp" },
      ],
      "Invalid",
    );
    expect(errors).toEqual({ notes: "Prea lung", status: "Invalid" });
  });
});
