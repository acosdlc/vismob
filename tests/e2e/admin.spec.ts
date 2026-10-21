import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// PR-7 acceptance for the admin gate (docs/PLAN.md): with no Supabase variables the
// proxy treats every visitor as anonymous, so /admin and its screens land on the
// login page, which opens with its H1, the two fields and the button, is noindex
// and has no axe violations at 1440×900 and 390×844. Signing in needs the Vercel
// preview (Supabase): the container has no secrets.

for (const path of ["/admin", "/admin/cereri", "/admin/setari", "/admin/catalog", "/admin/preturi"]) {
  test(`${path} sends an anonymous visitor to /admin/login`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response, `no response for ${path}`).not.toBeNull();
    expect(response!.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await expect(page.getByRole("heading", { level: 1, name: "Intră în cont" })).toBeVisible();
  });
}

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
