// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";
import { furnitureStoreJsonLd, jsonLdScript } from "./json-ld";

const ORIGIN = "https://www.vismob.dev";

/** The seed with the workshop's values filled in, as the admin's Setări would store them. */
const REAL: Settings = {
  ...SEED_SETTINGS,
  workshop_name: "Atelierul Țăranu",
  address: "Str. Fabricii 12, Timișoara",
  city: "Timișoara",
  phone_public: "0722 123 456",
  email_public: "contact@atelier.ro",
  instagram_url: "https://www.instagram.com/atelier",
  facebook_url: "https://www.facebook.com/atelier",
  google_profile_url: "https://g.page/atelier",
};

describe("furnitureStoreJsonLd", () => {
  it("is null while the name is still the seed's placeholder, or empty", () => {
    expect(furnitureStoreJsonLd(SEED_SETTINGS, ORIGIN)).toBeNull();
    expect(furnitureStoreJsonLd({ ...REAL, workshop_name: "" }, ORIGIN)).toBeNull();
    expect(furnitureStoreJsonLd({ ...REAL, workshop_name: "   " }, ORIGIN)).toBeNull();
    expect(furnitureStoreJsonLd({ ...REAL, workshop_name: "[Nume atelier]" }, ORIGIN)).toBeNull();
  });

  it("builds the full object from real values, in schema.org terms", () => {
    expect(furnitureStoreJsonLd(REAL, ORIGIN)).toEqual({
      "@context": "https://schema.org",
      "@type": "FurnitureStore",
      name: "Atelierul Țăranu",
      url: "https://www.vismob.dev",
      telephone: "0722 123 456",
      email: "contact@atelier.ro",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Str. Fabricii 12, Timișoara",
        addressLocality: "Timișoara",
        addressCountry: "RO",
      },
      sameAs: ["https://www.instagram.com/atelier", "https://www.facebook.com/atelier", "https://g.page/atelier"],
      image: "https://www.vismob.dev/opengraph-image",
    });
  });

  it("puts an address typed on two lines on one line", () => {
    const data = furnitureStoreJsonLd({ ...REAL, address: "Str. Fabricii 12\nTimișoara" }, ORIGIN);
    expect(data?.address).toMatchObject({ streetAddress: "Str. Fabricii 12, Timișoara" });
  });

  it("drops every field whose value is a placeholder or empty, the address object included", () => {
    const data = furnitureStoreJsonLd({ ...SEED_SETTINGS, workshop_name: "Atelierul Țăranu" }, ORIGIN);
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "FurnitureStore",
      name: "Atelierul Țăranu",
      url: "https://www.vismob.dev",
      image: "https://www.vismob.dev/opengraph-image",
    });
    expect(JSON.stringify(data)).not.toContain("[");
  });

  it("keeps the address with one real field and sameAs with only the filled-in links", () => {
    const data = furnitureStoreJsonLd(
      { ...REAL, address: SEED_SETTINGS.address, facebook_url: "", google_profile_url: "[link]" },
      ORIGIN,
    );
    expect(data?.address).toEqual({ "@type": "PostalAddress", addressLocality: "Timișoara", addressCountry: "RO" });
    expect(data?.sameAs).toEqual(["https://www.instagram.com/atelier"]);
  });

  it("strips a trailing slash from the origin and trims the values", () => {
    const data = furnitureStoreJsonLd({ ...REAL, workshop_name: " Atelierul Țăranu ", city: " Timișoara " }, `${ORIGIN}/`);
    expect(data?.url).toBe("https://www.vismob.dev");
    expect(data?.image).toBe("https://www.vismob.dev/opengraph-image");
    expect(data?.name).toBe("Atelierul Țăranu");
    expect((data?.address as Record<string, string>).addressLocality).toBe("Timișoara");
  });
});

describe("jsonLdScript", () => {
  it("serialises the object and escapes < so a value cannot close the script", () => {
    expect(jsonLdScript({ "@type": "FurnitureStore", name: "A" })).toBe('{"@type":"FurnitureStore","name":"A"}');
    expect(jsonLdScript({ name: "</script><b>" })).toBe('{"name":"\\u003c/script>\\u003cb>"}');
    expect(jsonLdScript({ name: "</script>" })).not.toContain("<");
  });
});
