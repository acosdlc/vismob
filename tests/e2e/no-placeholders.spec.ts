import { expect, test, type Page } from "@playwright/test";
import { PUBLIC_ROUTES } from "@/app/sitemap";
import { waitForFonts } from "./axe";

// PLAN PR-11, the placeholder gate (CLAUDE.md: from phase 4 on, no `[...]`
// placeholder is visible). Every public route, at both widths, fails on a `[`
// in the visible text, the title or the description, and on a visible FOTO box
// (PhotoPlaceholder marks it with `data-placeholder`: „FOTO 01” has no bracket).
// On /materiale every tab is opened, because only the selected one is rendered,
// and every closed <details> is opened before the text is read.
// The container's seed still carries placeholders, so this runs only by hand
// against a deployment whose content is entered (docs/LAUNCH.md):
//   PLACEHOLDER_GATE=1 PLAYWRIGHT_BASE_URL=https://… npx playwright test tests/e2e/no-placeholders.spec.ts
test.skip(!process.env.PLACEHOLDER_GATE, "set PLACEHOLDER_GATE=1 against a deployment whose content is in");

/** Fails on the unfinished content a visitor can see on the page as it stands; `where` names it in the report. */
async function expectNoPlaceholders(page: Page, where: string): Promise<void> {
  // The answers of „08 — Întrebări” sit in closed <details>, which innerText leaves out,
  // and four settings values are printed nowhere else: open every one before reading.
  await page.evaluate(() => {
    document.querySelectorAll("details").forEach((details) => {
      details.open = true;
    });
  });

  // innerText: what a visitor can see, so the closed mobile menu and the scripts stay out.
  const lines = await page.evaluate(() => document.body.innerText.split("\n").filter((line) => line.includes("[")));
  expect(lines, `visible placeholders on ${where}`).toEqual([]);

  // Each box by its label and frame text. The hatched box of the click-to-load map has no mark.
  const boxes = await page.locator("[data-placeholder]").filter({ visible: true }).allInnerTexts();
  const photos = boxes.map((text) => text.replace(/\s+/g, " ").trim() || "(no label)");
  expect(photos, `photo placeholders on ${where}`).toEqual([]);
}

for (const route of PUBLIC_ROUTES) {
  test(`${route}: no placeholder left`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status()).toBe(200);
    await waitForFonts(page);
    // /configurator streams its catalogue in: read the page once the skeleton has gone.
    await expect(page.getByTestId("configurator-skeleton")).toHaveCount(0);

    await expectNoPlaceholders(page, route);
    const head = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    }));
    expect(head.title, `title of ${route}`).not.toContain("[");
    expect(head.description, `description of ${route}`).not.toContain("[");

    if (route === "/materiale") {
      // MaterialsBrowser renders the selected tab alone: the wood family, the finishes
      // and the base cards with their photos are in the page only once their tab is open.
      const tabs = page.getByRole("tab");
      const count = await tabs.count();
      expect(count, `tabs on ${route}`).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const tab = tabs.nth(i);
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        const name = (await tab.innerText()).replace(/\s+/g, " ").trim();
        await expectNoPlaceholders(page, `${route}, tab „${name}”`);
      }
    }
  });
}
