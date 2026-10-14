import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Acceptance for PR-1: zero axe violations and a full-page screenshot at 1440 and 390
// for the home page, a legal stub and the 404 page (CLAUDE.md "Done means").
const ROUTES: Array<{ path: string; name: string; status?: number }> = [
  { path: "/", name: "acasa" },
  { path: "/confidentialitate", name: "confidentialitate" },
  { path: "/pagina-inexistenta", name: "404", status: 404 },
];

for (const route of ROUTES) {
  test(`${route.path}: accessible and rendered`, async ({ page }, testInfo) => {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(route.status ?? 200);
    await page.waitForLoadState("networkidle");

    // @axe-core/playwright bundles a newer playwright-core whose Page type differs
    // from @playwright/test 1.56.1 (pinned to the container's Chromium); same runtime API.
    const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

    await page.screenshot({ path: `screenshots/${route.name}-${testInfo.project.name}.png`, fullPage: true });
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
