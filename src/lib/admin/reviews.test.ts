// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canPublish,
  EXCERPT_LENGTH,
  parseReviewForm,
  REVIEW_MESSAGES,
  REVIEW_SOURCES,
  reviewExcerpt,
  reviewLabel,
  reviewSourceLabel,
} from "./reviews";
import { ADMIN_MESSAGES } from "./types";

/** A full, valid post of the form; a test overrides what it checks. */
function form(overrides: Record<string, string | undefined> = {}): FormData {
  const values: Record<string, string | undefined> = {
    first_name: "Ana",
    city: "Cluj",
    body: "Patul a venit exact cum l-am configurat.",
    model_label: "Capitonat · 160 × 200",
    source: "google",
    consent: "on",
    published: "on",
    sort: "3",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

describe("REVIEW_SOURCES and reviewSourceLabel", () => {
  it("offers the four sources in order, each with a label", () => {
    expect(REVIEW_SOURCES.map((source) => source.value)).toEqual(["google", "facebook", "whatsapp", "direct"]);
    expect(REVIEW_SOURCES.map((source) => source.label)).toEqual(["Google", "Facebook", "WhatsApp", "Direct, în atelier"]);
  });

  it("labels a known value, echoes an unknown one and shows a dash for none", () => {
    expect(reviewSourceLabel("google")).toBe("Google");
    expect(reviewSourceLabel("direct")).toBe("Direct, în atelier");
    expect(reviewSourceLabel("instagram")).toBe("instagram");
    expect(reviewSourceLabel(null)).toBe("—");
    expect(reviewSourceLabel(undefined)).toBe("—");
    expect(reviewSourceLabel("")).toBe("—");
  });
});

describe("reviewLabel", () => {
  it("joins the first name and the city with a comma, or gives the name alone", () => {
    expect(reviewLabel({ first_name: "Ana", city: "Cluj" })).toBe("Ana, Cluj");
    expect(reviewLabel({ first_name: "Ana", city: null })).toBe("Ana");
    expect(reviewLabel({ first_name: "Ana", city: "" })).toBe("Ana");
  });
});

describe("reviewExcerpt", () => {
  it("returns a short body unchanged", () => {
    expect(reviewExcerpt("Scurt.")).toBe("Scurt.");
    expect(reviewExcerpt("x".repeat(EXCERPT_LENGTH))).toBe("x".repeat(EXCERPT_LENGTH));
  });

  it("cuts a long body at the limit, trims the end and appends the ellipsis", () => {
    const body = "a".repeat(89) + " bcdef";
    expect(reviewExcerpt(body)).toBe("a".repeat(89) + "…");
    expect(reviewExcerpt("x".repeat(100))).toBe("x".repeat(90) + "…");
    expect(reviewExcerpt("abcdef", 3)).toBe("abc…");
  });

  it("counts code points, so a diacritic at the cut is kept whole", () => {
    expect(reviewExcerpt("țțțț", 2)).toBe("țț…");
    expect(reviewExcerpt("ab😀cd", 3)).toBe("ab😀…");
  });
});

describe("parseReviewForm", () => {
  it("accepts a full form and trims the texts", () => {
    const result = parseReviewForm(form({ first_name: "  Ana ", city: " Cluj ", body: " Foarte mulțumită. ", model_label: " Capitonat · 160 × 200 " }));
    expect(result).toEqual({
      ok: true,
      data: {
        first_name: "Ana",
        city: "Cluj",
        body: "Foarte mulțumită.",
        model_label: "Capitonat · 160 × 200",
        source: "google",
        consent: true,
        published: true,
        sort: 3,
      },
    });
  });

  it("turns the empty optional texts and the empty source into null", () => {
    const result = parseReviewForm(form({ city: "", model_label: "   ", source: "" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.city).toBeNull();
    expect(result.data.model_label).toBeNull();
    expect(result.data.source).toBeNull();
  });

  it("treats absent optional fields as empty and absent checkboxes as unticked", () => {
    const result = parseReviewForm(form({ city: undefined, model_label: undefined, source: undefined, consent: undefined, published: undefined, sort: undefined }));
    expect(result).toEqual({
      ok: true,
      data: {
        first_name: "Ana",
        city: null,
        body: "Patul a venit exact cum l-am configurat.",
        model_label: null,
        source: null,
        consent: false,
        published: false,
        sort: 0,
      },
    });
  });

  it("accepts every source of the select", () => {
    for (const source of REVIEW_SOURCES) {
      const result = parseReviewForm(form({ source: source.value }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.source).toBe(source.value);
    }
  });

  it("requires the first name and the body", () => {
    expect(parseReviewForm(form({ first_name: "" }))).toEqual({ ok: false, fieldErrors: { first_name: ADMIN_MESSAGES.required } });
    expect(parseReviewForm(form({ first_name: "   " }))).toEqual({ ok: false, fieldErrors: { first_name: ADMIN_MESSAGES.required } });
    expect(parseReviewForm(form({ body: "" }))).toEqual({ ok: false, fieldErrors: { body: ADMIN_MESSAGES.required } });
    expect(parseReviewForm(form({ first_name: undefined, body: undefined }))).toEqual({
      ok: false,
      fieldErrors: { first_name: ADMIN_MESSAGES.required, body: ADMIN_MESSAGES.required },
    });
  });

  it("bounds every text", () => {
    expect(parseReviewForm(form({ first_name: "a".repeat(60) })).ok).toBe(true);
    expect(parseReviewForm(form({ first_name: "a".repeat(61) }))).toEqual({ ok: false, fieldErrors: { first_name: ADMIN_MESSAGES.tooLong } });
    expect(parseReviewForm(form({ city: "a".repeat(80) })).ok).toBe(true);
    expect(parseReviewForm(form({ city: "a".repeat(81) }))).toEqual({ ok: false, fieldErrors: { city: ADMIN_MESSAGES.tooLong } });
    expect(parseReviewForm(form({ body: "a".repeat(1000) })).ok).toBe(true);
    expect(parseReviewForm(form({ body: "a".repeat(1001) }))).toEqual({ ok: false, fieldErrors: { body: ADMIN_MESSAGES.tooLong } });
    expect(parseReviewForm(form({ model_label: "a".repeat(80) })).ok).toBe(true);
    expect(parseReviewForm(form({ model_label: "a".repeat(81) }))).toEqual({ ok: false, fieldErrors: { model_label: ADMIN_MESSAGES.tooLong } });
  });

  it("refuses a source the select does not offer", () => {
    expect(parseReviewForm(form({ source: "instagram" }))).toEqual({ ok: false, fieldErrors: { source: ADMIN_MESSAGES.invalid } });
    expect(parseReviewForm(form({ source: "Google" }))).toEqual({ ok: false, fieldErrors: { source: ADMIN_MESSAGES.invalid } });
  });

  it("reads the checkboxes from their 'on' value only", () => {
    const ticked = parseReviewForm(form({ consent: "on", published: "on" }));
    expect(ticked.ok && ticked.data.consent && ticked.data.published).toBe(true);
    const other = parseReviewForm(form({ consent: "true", published: "1" }));
    expect(other.ok).toBe(true);
    if (other.ok) {
      expect(other.data.consent).toBe(false);
      expect(other.data.published).toBe(false);
    }
  });

  it("bounds the order to an integer between 0 and 999", () => {
    expect(parseReviewForm(form({ sort: "0" })).ok).toBe(true);
    expect(parseReviewForm(form({ sort: "999" })).ok).toBe(true);
    expect(parseReviewForm(form({ sort: "1000" }))).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
    expect(parseReviewForm(form({ sort: "-1" }))).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
    expect(parseReviewForm(form({ sort: "2.5" }))).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
    expect(parseReviewForm(form({ sort: "abc" }))).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
  });

  it("reports the first message per field, every field at once", () => {
    const result = parseReviewForm(form({ first_name: "", body: "", source: "x", sort: "-3" }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        first_name: ADMIN_MESSAGES.required,
        body: ADMIN_MESSAGES.required,
        source: ADMIN_MESSAGES.invalid,
        sort: ADMIN_MESSAGES.invalid,
      },
    });
  });

  it("ignores files and React's own entries", () => {
    const fd = form();
    fd.set("$ACTION_ID_1", "x");
    fd.set("photo", new Blob(["x"]), "poza.jpg");
    const result = parseReviewForm(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.data)).toEqual(["first_name", "city", "body", "model_label", "source", "consent", "published", "sort"]);
  });
});

describe("canPublish", () => {
  it("allows an unpublished review with or without consent", () => {
    expect(canPublish({ published: false, consent: false })).toBe(true);
    expect(canPublish({ published: false, consent: true })).toBe(true);
  });

  it("allows a published review only with the consent", () => {
    expect(canPublish({ published: true, consent: true })).toBe(true);
    expect(canPublish({ published: true, consent: false })).toBe(false);
  });

  it("carries the message the action answers with", () => {
    expect(REVIEW_MESSAGES.consent).toBe("Publicarea cere acordul clientului; bifează-l întâi.");
  });
});
