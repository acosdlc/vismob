import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// PR-7 acceptance for the admin gate (docs/PLAN.md): with no Supabase variables the
// proxy treats every visitor as anonymous, so /admin and its screens land on the
// login page, which opens with its H1, the two fields and the button, is noindex
// and has no axe violations at 1440×900 and 390×844. Signing in needs the Vercel
// preview (Supabase): the container has no secrets.

for (const path of ["/admin", "/admin/cereri", "/admin/setari", "/admin/catalog", "/admin/preturi", "/admin/lucrari", "/admin/recenzii"]) {
  test(`${path} sends an anonymous visitor to /admin/login`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response, `no response for ${path}`).not.toBeNull();
    expect(response!.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await expect(page.getByRole("heading", { level: 1, name: "Intră în cont" })).toBeVisible();
  });
}

// The proxy redirects navigations only. A Server Action is a POST to the page's own
// address, and a redirect in its place leaves the form with the framework's error
// screen instead of the action's answer. This id names no action, so Next refuses the
// call itself (4xx) before any app code runs; a real one reaches the action, whose
// first step is its own session check.
test("an anonymous POST to an admin screen is not answered with a redirect", async ({ request }) => {
  const response = await request.post("/admin/setari", {
    headers: { "next-action": "not-an-action" },
    maxRedirects: 0,
  });
  expect(response.headers()["location"]).toBeUndefined();
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.status()).toBeLessThan(500);
});

test("/admin/login: the form, noindex, accessible and captured", async ({ page }, testInfo) => {
  const response = await page.goto("/admin/login");
  expect(response, "no response for /admin/login").not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/admin/login");

  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page.getByRole("heading", { level: 1, name: "Intră în cont" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const email = page.getByLabel("Email");
  await expect(email).toHaveAttribute("type", "email");
  await expect(email).toHaveAttribute("autocomplete", "username");
  const password = page.getByLabel("Parolă");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("button", { name: "Intră" })).toBeEnabled();
  // No admin chrome on the login screen.
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);

  await waitForFonts(page);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: screenshotPath("/admin/login", testInfo.project.name), fullPage: true });
});
