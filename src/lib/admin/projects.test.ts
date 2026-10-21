import { describe, expect, it } from "vitest";
import { PHOTO_FIELDS } from "./media";
import {
  canPublish,
  EXTRAS,
  extrasLabels,
  extrasValues,
  heroAllowed,
  isIsoDate,
  isUuid,
  NEW_PHOTO_ALT_FIELD,
  NIL_UUID,
  parseProjectForm,
  parseProjectPhotosForm,
  PHOTO_ROW_ID_FIELD,
  photoRowFields,
  PROJECT_MESSAGES,
  PROJECT_MODEL_IDS,
  projectSlugFor,
} from "./projects";
import { ADMIN_MESSAGES } from "./types";

/** A full, valid post of the project form. */
function form(overrides: Record<string, string | string[] | undefined> = {}): FormData {
  const values: Record<string, string | string[] | undefined> = {
    id: "",
    title: "Pat capitonat pentru un dormitor mic",
    ticket_no: "0412",
    model_id: "capitonat",
    width_cm: "160",
    length_cm: "200",
    material_id: "ct-verde",
    base_id: "lada",
    extras: ["led", "nightstands"],
    city: "Cluj-Napoca",
    delivered_on: "2026-03-14",
    client_consent: "on",
    published: "on",
    featured: "on",
    hero: "",
    sort: "3",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v));
    else fd.set(key, value);
  }
  return fd;
}

const PHOTO_A = "3f2b1c4d-0000-4000-8000-000000000001";
const PHOTO_B = "3f2b1c4d-0000-4000-8000-000000000002";
const NEW_PATH = "projects/9a1b2c3d-0000-4000-8000-00000000abcd-1792569600000.webp";

describe("extras", () => {
  it("lists the two extras with the labels the site prints", () => {
    expect(EXTRAS).toEqual([
      { value: "led", label: "LED sub pat" },
      { value: "nightstands", label: "2 noptiere" },
    ]);
  });

  it("maps posted values to labels, deduplicated and in a fixed order, and back", () => {
    expect(extrasLabels(["nightstands", "led", "led"])).toEqual(["LED sub pat", "2 noptiere"]);
    expect(extrasLabels([])).toEqual([]);
    expect(extrasLabels(["altceva"])).toEqual([]);
    expect(extrasValues(["2 noptiere"])).toEqual(["nightstands"]);
    expect(extrasValues(["LED sub pat", "2 noptiere"])).toEqual(["led", "nightstands"]);
    expect(extrasValues(["Altceva"])).toEqual([]);
  });
});

describe("isUuid / isIsoDate / NIL_UUID", () => {
  it("accepts a uuid in either case and refuses anything else", () => {
    expect(isUuid(PHOTO_A)).toBe(true);
    expect(isUuid(PHOTO_A.toUpperCase())).toBe(true);
    expect(isUuid(NIL_UUID)).toBe(true);
    expect(isUuid("ct-verde")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(new File([], "x"))).toBe(false);
  });

  it("accepts a real ISO date and refuses the pattern alone", () => {
    expect(isIsoDate("2026-03-14")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("14.03.2026")).toBe(false);
    expect(isIsoDate("2026-3-4")).toBe(false);
  });
});

describe("parseProjectForm", () => {
  it("accepts a full form, trims, maps the extras to labels and reads the checkboxes", () => {
    const result = parseProjectForm(form({ title: "  Pat capitonat  ", city: " Cluj-Napoca " }));
    expect(result).toEqual({
      ok: true,
      data: {
        title: "Pat capitonat",
        ticket_no: "0412",
        model_id: "capitonat",
        width_cm: 160,
        length_cm: 200,
        material_id: "ct-verde",
        base_id: "lada",
        extras: ["LED sub pat", "2 noptiere"],
        city: "Cluj-Napoca",
        delivered_on: "2026-03-14",
        client_consent: true,
        published: true,
        featured: true,
        hero: false,
        sort: 3,
      },
    });
  });

  it("stores the empty optional fields as null, no extras as [], an unticked box as false and no sort as 0", () => {
    const result = parseProjectForm(
      form({
        ticket_no: "",
        material_id: "",
        base_id: "",
        extras: [],
        city: "",
        delivered_on: "",
        client_consent: undefined,
        published: undefined,
        featured: undefined,
        hero: undefined,
        sort: "",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      ticket_no: null,
      material_id: null,
      base_id: null,
      extras: [],
      city: null,
      delivered_on: null,
      client_consent: false,
      published: false,
      featured: false,
      hero: false,
      sort: 0,
    });
  });

  it("deduplicates the extras and ignores a value it does not know as invalid", () => {
    const twice = parseProjectForm(form({ extras: ["led", "led"] }));
    expect(twice.ok && twice.data.extras).toEqual(["LED sub pat"]);
    const unknown = parseProjectForm(form({ extras: ["led", "sauna"] }));
    expect(unknown).toEqual({ ok: false, fieldErrors: { extras: ADMIN_MESSAGES.invalid } });
  });

  it("requires the title and bounds it", () => {
    expect(parseProjectForm(form({ title: "   " }))).toEqual({ ok: false, fieldErrors: { title: ADMIN_MESSAGES.required } });
    expect(parseProjectForm(form({ title: undefined }))).toEqual({ ok: false, fieldErrors: { title: ADMIN_MESSAGES.required } });
    expect(parseProjectForm(form({ title: "a".repeat(121) }))).toEqual({ ok: false, fieldErrors: { title: ADMIN_MESSAGES.tooLong } });
    expect(parseProjectForm(form({ title: "a".repeat(120) })).ok).toBe(true);
  });

  it("bounds the ticket number and the city", () => {
    expect(parseProjectForm(form({ ticket_no: "1".repeat(21) }))).toEqual({ ok: false, fieldErrors: { ticket_no: ADMIN_MESSAGES.tooLong } });
    expect(parseProjectForm(form({ city: "c".repeat(81) }))).toEqual({ ok: false, fieldErrors: { city: ADMIN_MESSAGES.tooLong } });
  });

  it("accepts only the four model ids", () => {
    for (const id of PROJECT_MODEL_IDS) expect(parseProjectForm(form({ model_id: id })).ok).toBe(true);
    expect(parseProjectForm(form({ model_id: "rotund" }))).toEqual({ ok: false, fieldErrors: { model_id: PROJECT_MESSAGES.model } });
    expect(parseProjectForm(form({ model_id: undefined }))).toEqual({ ok: false, fieldErrors: { model_id: PROJECT_MESSAGES.model } });
  });

  it("requires whole mattress sides between 60 and 300 cm, with one text for every failure", () => {
    expect(parseProjectForm(form({ width_cm: "" }))).toEqual({ ok: false, fieldErrors: { width_cm: PROJECT_MESSAGES.size } });
    expect(parseProjectForm(form({ width_cm: undefined }))).toEqual({ ok: false, fieldErrors: { width_cm: PROJECT_MESSAGES.size } });
    expect(parseProjectForm(form({ length_cm: "59" }))).toEqual({ ok: false, fieldErrors: { length_cm: PROJECT_MESSAGES.size } });
    expect(parseProjectForm(form({ length_cm: "301" }))).toEqual({ ok: false, fieldErrors: { length_cm: PROJECT_MESSAGES.size } });
    expect(parseProjectForm(form({ width_cm: "160.5" }))).toEqual({ ok: false, fieldErrors: { width_cm: PROJECT_MESSAGES.size } });
    expect(parseProjectForm(form({ width_cm: "lat" }))).toEqual({ ok: false, fieldErrors: { width_cm: PROJECT_MESSAGES.size } });
    expect(parseProjectForm(form({ width_cm: "60", length_cm: "300" })).ok).toBe(true);
  });

  it("refuses a delivery date that is not a real ISO date", () => {
    expect(parseProjectForm(form({ delivered_on: "14.03.2026" }))).toEqual({ ok: false, fieldErrors: { delivered_on: ADMIN_MESSAGES.invalid } });
    expect(parseProjectForm(form({ delivered_on: "2026-02-30" }))).toEqual({ ok: false, fieldErrors: { delivered_on: ADMIN_MESSAGES.invalid } });
    expect(parseProjectForm(form({ delivered_on: " 2026-03-14 " })).ok).toBe(true);
  });

  it("refuses a sort outside 0 … 999 or not whole", () => {
    expect(parseProjectForm(form({ sort: "-1" }))).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
    expect(parseProjectForm(form({ sort: "1000" }))).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
    expect(parseProjectForm(form({ sort: "1.5" }))).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
  });

  it("reports the first message per field for several failures at once", () => {
    const result = parseProjectForm(form({ title: "", model_id: "x", width_cm: "", delivered_on: "azi" }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        title: ADMIN_MESSAGES.required,
        model_id: PROJECT_MESSAGES.model,
        width_cm: PROJECT_MESSAGES.size,
        delivered_on: ADMIN_MESSAGES.invalid,
      },
    });
  });
});

describe("canPublish / heroAllowed", () => {
  it("lets a project be published only with the client's consent", () => {
    expect(canPublish({ published: true, client_consent: true })).toBe(true);
    expect(canPublish({ published: true, client_consent: false })).toBe(false);
    expect(canPublish({ published: false, client_consent: false })).toBe(true);
    expect(canPublish({ published: false, client_consent: true })).toBe(true);
  });

  it("lets a project be the hero only when published", () => {
    expect(heroAllowed({ hero: true, published: true })).toBe(true);
    expect(heroAllowed({ hero: true, published: false })).toBe(false);
    expect(heroAllowed({ hero: false, published: false })).toBe(true);
    expect(heroAllowed({ hero: false, published: true })).toBe(true);
  });
});

describe("projectSlugFor", () => {
  it("slugifies the title with the diacritics stripped", () => {
    expect(projectSlugFor("Pat capitonat în mansardă, Cluj", [])).toEqual({ ok: true, slug: "pat-capitonat-in-mansarda-cluj" });
  });

  it("steps past taken slugs with -2, -3…", () => {
    expect(projectSlugFor("Pat capitonat", ["pat-capitonat"])).toEqual({ ok: true, slug: "pat-capitonat-2" });
    expect(projectSlugFor("Pat capitonat", ["pat-capitonat", "pat-capitonat-2", "pat-arcuit"])).toEqual({ ok: true, slug: "pat-capitonat-3" });
  });

  it("refuses a title that leaves no slug", () => {
    expect(projectSlugFor("***", [])).toEqual({ ok: false, message: PROJECT_MESSAGES.slug });
    expect(projectSlugFor("   ", [])).toEqual({ ok: false, message: PROJECT_MESSAGES.slug });
  });

  it("keeps the slug within slugify's bound", () => {
    const result = projectSlugFor("a".repeat(100), []);
    expect(result.ok && result.slug).toBe("a".repeat(40));
  });
});

describe("photoRowFields", () => {
  it("names the three inputs of a row after its id", () => {
    expect(photoRowFields(PHOTO_A)).toEqual({ alt: `photo_alt_${PHOTO_A}`, sort: `photo_sort_${PHOTO_A}`, delete: `photo_delete_${PHOTO_A}` });
    expect(PHOTO_ROW_ID_FIELD).toBe("photo_id");
    expect(NEW_PHOTO_ALT_FIELD).toBe("new_photo_alt");
  });
});

describe("parseProjectPhotosForm", () => {
  function photosForm(entries: [string, string][]): FormData {
    const fd = new FormData();
    for (const [key, value] of entries) fd.append(key, value);
    return fd;
  }

  const row = (id: string, alt: string, sort: string, remove = false): [string, string][] => {
    const names = photoRowFields(id);
    const entries: [string, string][] = [
      [PHOTO_ROW_ID_FIELD, id],
      [names.alt, alt],
      [names.sort, sort],
    ];
    if (remove) entries.push([names.delete, "on"]);
    return entries;
  };

  it("reads every posted row in order and no new photo when none was picked", () => {
    const result = parseProjectPhotosForm(
      photosForm([...row(PHOTO_A, "  Patul din față ", "0"), ...row(PHOTO_B, "Detaliu tăblie", "1"), [PHOTO_FIELDS.path, ""], [PHOTO_FIELDS.before, ""]]),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        edits: [
          { id: PHOTO_A, alt: "Patul din față", sort: 0, delete: false },
          { id: PHOTO_B, alt: "Detaliu tăblie", sort: 1, delete: false },
        ],
        newPhoto: null,
      },
    });
  });

  it("accepts an empty form (a project without photos, nothing added)", () => {
    expect(parseProjectPhotosForm(photosForm([]))).toEqual({ ok: true, data: { edits: [], newPhoto: null } });
  });

  it("marks a row ticked for deletion and does not validate its other fields", () => {
    const result = parseProjectPhotosForm(photosForm(row(PHOTO_A, "", "", true)));
    expect(result).toEqual({ ok: true, data: { edits: [{ id: PHOTO_A, alt: "", sort: 0, delete: true }], newPhoto: null } });
  });

  it("refuses an empty alt text on a kept row, under that row's input name", () => {
    const result = parseProjectPhotosForm(photosForm([...row(PHOTO_A, "   ", "0"), ...row(PHOTO_B, "Ok", "1")]));
    expect(result).toEqual({ ok: false, fieldErrors: { [photoRowFields(PHOTO_A).alt]: PROJECT_MESSAGES.photos } });
  });

  it("treats a missing alt or sort input like an empty one", () => {
    const result = parseProjectPhotosForm(photosForm([[PHOTO_ROW_ID_FIELD, PHOTO_A]]));
    expect(result).toEqual({ ok: false, fieldErrors: { [photoRowFields(PHOTO_A).alt]: PROJECT_MESSAGES.photos } });
    const noSort = parseProjectPhotosForm(photosForm([[PHOTO_ROW_ID_FIELD, PHOTO_A], [photoRowFields(PHOTO_A).alt, "Ok"]]));
    expect(noSort).toEqual({ ok: true, data: { edits: [{ id: PHOTO_A, alt: "Ok", sort: 0, delete: false }], newPhoto: null } });
  });

  it("bounds the alt text and the sort of a row", () => {
    const names = photoRowFields(PHOTO_A);
    expect(parseProjectPhotosForm(photosForm(row(PHOTO_A, "a".repeat(201), "0")))).toEqual({
      ok: false,
      fieldErrors: { [names.alt]: ADMIN_MESSAGES.tooLong },
    });
    expect(parseProjectPhotosForm(photosForm(row(PHOTO_A, "Ok", "1000")))).toEqual({ ok: false, fieldErrors: { [names.sort]: ADMIN_MESSAGES.invalid } });
    expect(parseProjectPhotosForm(photosForm(row(PHOTO_A, "Ok", "2.5")))).toEqual({ ok: false, fieldErrors: { [names.sort]: ADMIN_MESSAGES.invalid } });
    expect(parseProjectPhotosForm(photosForm(row(PHOTO_A, "", "-1")))).toEqual({
      ok: false,
      fieldErrors: { [names.alt]: PROJECT_MESSAGES.photos, [names.sort]: ADMIN_MESSAGES.invalid },
    });
  });

  it("refuses a photo id that is not a uuid and skips a repeated one", () => {
    expect(parseProjectPhotosForm(photosForm([[PHOTO_ROW_ID_FIELD, "poza-1"]]))).toEqual({
      ok: false,
      fieldErrors: { [PHOTO_ROW_ID_FIELD]: ADMIN_MESSAGES.invalid },
    });
    const twice = parseProjectPhotosForm(photosForm([...row(PHOTO_A, "Ok", "0"), [PHOTO_ROW_ID_FIELD, PHOTO_A]]));
    expect(twice.ok && twice.data.edits).toHaveLength(1);
  });

  it("reads the new photo with its alt, appended after the rows", () => {
    const result = parseProjectPhotosForm(
      photosForm([...row(PHOTO_A, "Ok", "0"), [PHOTO_FIELDS.path, NEW_PATH], [PHOTO_FIELDS.before, ""], [NEW_PHOTO_ALT_FIELD, " Patul în cameră "]]),
    );
    expect(result).toEqual({
      ok: true,
      data: { edits: [{ id: PHOTO_A, alt: "Ok", sort: 0, delete: false }], newPhoto: { path: NEW_PATH, alt: "Patul în cameră" } },
    });
  });

  it("requires the alt text once a new photo is posted, and bounds it", () => {
    expect(parseProjectPhotosForm(photosForm([[PHOTO_FIELDS.path, NEW_PATH], [PHOTO_FIELDS.before, ""]]))).toEqual({
      ok: false,
      fieldErrors: { [NEW_PHOTO_ALT_FIELD]: PROJECT_MESSAGES.photos },
    });
    expect(parseProjectPhotosForm(photosForm([[PHOTO_FIELDS.path, NEW_PATH], [NEW_PHOTO_ALT_FIELD, "   "]]))).toEqual({
      ok: false,
      fieldErrors: { [NEW_PHOTO_ALT_FIELD]: PROJECT_MESSAGES.photos },
    });
    expect(parseProjectPhotosForm(photosForm([[PHOTO_FIELDS.path, NEW_PATH], [NEW_PHOTO_ALT_FIELD, "a".repeat(201)]]))).toEqual({
      ok: false,
      fieldErrors: { [NEW_PHOTO_ALT_FIELD]: ADMIN_MESSAGES.tooLong },
    });
  });

  it("ignores an alt text typed without a photo", () => {
    expect(parseProjectPhotosForm(photosForm([[PHOTO_FIELDS.path, ""], [NEW_PHOTO_ALT_FIELD, "Fără poză"]]))).toEqual({
      ok: true,
      data: { edits: [], newPhoto: null },
    });
  });

  it("refuses a new photo path outside the projects folder or not from PhotoField", () => {
    expect(parseProjectPhotosForm(photosForm([[PHOTO_FIELDS.path, "materials/ct-verde-1792569508760.webp"], [NEW_PHOTO_ALT_FIELD, "Ok"]]))).toEqual({
      ok: false,
      fieldErrors: { [PHOTO_FIELDS.path]: ADMIN_MESSAGES.invalid },
    });
    expect(parseProjectPhotosForm(photosForm([[PHOTO_FIELDS.path, "https://example.com/x.webp"], [NEW_PHOTO_ALT_FIELD, "Ok"]]))).toEqual({
      ok: false,
      fieldErrors: { [PHOTO_FIELDS.path]: ADMIN_MESSAGES.invalid },
    });
  });

  it("collects the row errors and the new photo's error together", () => {
    const result = parseProjectPhotosForm(photosForm([...row(PHOTO_A, "", "0"), [PHOTO_FIELDS.path, NEW_PATH]]));
    expect(result).toEqual({
      ok: false,
      fieldErrors: { [photoRowFields(PHOTO_A).alt]: PROJECT_MESSAGES.photos, [NEW_PHOTO_ALT_FIELD]: PROJECT_MESSAGES.photos },
    });
  });
});
