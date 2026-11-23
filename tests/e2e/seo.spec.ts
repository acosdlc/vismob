import { expect, test } from "@playwright/test";

// PR-10 acceptance for SEO (ARHITECTURA §10): robots.txt, sitemap.xml and the
// OG image answer from `next start`, and the home page's <head> points at the
// image. The first three need no browser (`request` fixture). PR-11/12 add the
// JSON-LD on Acasă and the per-page canonical and description.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Every string value in a parsed JSON-LD object, nested objects and arrays included. */
function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

test("/robots.txt disallows /admin and names the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const body = await response.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /admin");
  expect(body).toMatch(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m);
});

test("/sitemap.xml lists the configurator and the gallery", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");
  const body = await response.text();
  expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  expect(body).toMatch(/<loc>https?:\/\/[^<]+\/configurator<\/loc>/);
  expect(body).toMatch(/<loc>https?:\/\/[^<]+\/lucrari<\/loc>/);
  expect(body).not.toMatch(/<loc>[^<]*\/admin/);
});

test("/opengraph-image is a PNG", async ({ request }) => {
  const response = await request.get("/opengraph-image");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const body = await response.body();
  expect(body.subarray(0, 8)).toEqual(PNG_SIGNATURE);
});

test("the home page points at the OG image", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const image = page.locator('head meta[property="og:image"]');
  await expect(image.first()).toHaveAttribute("content", /\/opengraph-image/);
});

test("the home page carries one FurnitureStore JSON-LD once the workshop's name is real", async ({ page }) => {
  await page.goto("/");
  const scripts = page.locator('script[type="application/ld+json"]');
  // With the seed the name is „[Nume atelier]” (shown in the header), and the
  // script must be absent rather than describe a placeholder (src/lib/seo/json-ld.ts).
  const seeded = (await page.locator("body").innerText()).includes("[Nume atelier]");
  if (seeded) {
    await expect(scripts).toHaveCount(0);
    return;
  }
  await expect(scripts).toHaveCount(1);
  const raw = await scripts.first().innerHTML();
  const data = JSON.parse(raw) as Record<string, unknown>;
  expect(data["@context"]).toBe("https://schema.org");
  expect(data["@type"]).toBe("FurnitureStore");
  expect(typeof data.name).toBe("string");
  // A `[` in a value is a placeholder (src/emails/shared.tsx `isReal`); the JSON's own
  // brackets are not one: `sameAs` is an array, so the raw text is not what to check.
  expect(stringValues(data).filter((text) => text.includes("[")), raw).toEqual([]);
});

test("/configurator has its canonical link and a description", async ({ page }) => {
  const response = await page.goto("/configurator");
  expect(response?.status()).toBe(200);
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/configurator$/);
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute("content", /Desenul se schimbă la fiecare alegere/);
});
