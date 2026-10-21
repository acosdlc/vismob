import { expect, test } from "@playwright/test";

// PR-10 acceptance for SEO (ARHITECTURA §10): robots.txt, sitemap.xml and the
// OG image answer from `next start`, and the home page's <head> points at the
// image. The first three need no browser (`request` fixture).

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
