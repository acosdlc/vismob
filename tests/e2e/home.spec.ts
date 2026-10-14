import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// Acceptance for PR-1 (CLAUDE.md "Done means"): every route opens, has no axe
// violations and is captured full-page at 1440×900 and 390×844 (playwright.config.ts).
const ROUTES = [
  { path: "/", status: 200 },
  { path: "/confidentialitate", status: 200 },
  { path: "/pagina-inexistenta", status: 404 },
] as const;

for (const route of ROUTES) {
  test(`${route.path}: accessible and captured`, async ({ page }, testInfo) => {
    const response = await page.goto(route.path);
    expect(response, `no response for ${route.path}`).not.toBeNull();
    expect(response!.status()).toBe(route.status);

    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await waitForFonts(page);
    await expectNoAxeViolations(page);
    await page.screenshot({ path: screenshotPath(route.path, testInfo.project.name), fullPage: true });
  });
}

test("the mobile menu opens, closes on Escape and returns focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Meniu" });
  await button.click();
  await expect(page.getByRole("button", { name: "Închide" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#meniu-mobil")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#meniu-mobil")).toBeHidden();
  await expect(page.getByRole("button", { name: "Meniu" })).toBeFocused();
});
