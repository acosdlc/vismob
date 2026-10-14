import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// PR-2 acceptance for /lucrari (DESIGN §4.4): the page and its `?model=` filter open
// with the H1, the active pill carries aria-current="page", no axe violations at
// 1440×900 and 390×844, and both states are captured.

const ROUTES = [
  { path: "/lucrari", current: "Toate", slug: "/lucrari" },
  { path: "/lucrari?model=arcuit", current: "Arcuit", slug: "/lucrari-arcuit" },
] as const;

for (const route of ROUTES) {
  test(`${route.path}: accessible, „${route.current}” is current, captured`, async ({ page }, testInfo) => {
    const response = await page.goto(route.path);
    expect(response, `no response for ${route.path}`).not.toBeNull();
    expect(response!.status()).toBe(200);

    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await expect(page.getByRole("heading", { level: 1, name: "Lucrări" })).toBeVisible();
    await expect(
      page.getByText("Proiecte reale, fotografiate la clienți acasă, cu dimensiunile și materialele folosite."),
    ).toBeVisible();

    const pills = page.getByRole("link", { name: /^(Toate|Capitonat|Arcuit|Canale|Lamele)$/ });
    await expect(pills).toHaveCount(5);
    await expect(page.getByRole("link", { name: route.current, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("a[aria-current='page']").filter({ hasText: /^(Toate|Capitonat|Arcuit|Canale|Lamele)$/ })).toHaveCount(1);

    // Tiles: every caption follows the §3.4 template; the filter leaves only that model.
    const captions = page.locator("figcaption");
    expect(await captions.count()).toBeGreaterThan(0);
    for (const text of await captions.allTextContents()) {
      if (route.current !== "Toate") expect(text.startsWith(`${route.current} ·`)).toBeTruthy();
      expect(text.split(" · ")).toHaveLength(4);
    }

    await waitForFonts(page);
    await expectNoAxeViolations(page);
    await page.screenshot({ path: screenshotPath(route.slug, testInfo.project.name), fullPage: true });
  });
}

test("a pill changes the URL state and the current pill", async ({ page }) => {
  await page.goto("/lucrari");
  await page.getByRole("link", { name: "Lamele", exact: true }).click();
  await expect(page).toHaveURL(/\/lucrari\?model=lamele$/);
  await expect(page.getByRole("link", { name: "Lamele", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Toate", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Toate", exact: true }).click();
  await expect(page).toHaveURL(/\/lucrari$/);
  await expect(page.getByRole("link", { name: "Toate", exact: true })).toHaveAttribute("aria-current", "page");
});
