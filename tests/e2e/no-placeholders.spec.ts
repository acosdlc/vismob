import { expect, test } from "@playwright/test";
import { PUBLIC_ROUTES } from "@/app/sitemap";
import { waitForFonts } from "./axe";

// PLAN PR-11, the placeholder gate (CLAUDE.md: from phase 4 on, no `[...]`
// placeholder is visible). Every public route, at both widths, fails on a `[`
// in the visible text, the title or the description. The container's seed still
// carries placeholders, so this runs only by hand against a deployment whose
// content is entered (docs/LAUNCH.md):
//   PLACEHOLDER_GATE=1 PLAYWRIGHT_BASE_URL=https://… npx playwright test tests/e2e/no-placeholders.spec.ts
test.skip(!process.env.PLACEHOLDER_GATE, "set PLACEHOLDER_GATE=1 against a deployment whose content is in");

for (const route of PUBLIC_ROUTES) {
  test(`${route}: no placeholder left`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status()).toBe(200);
    await waitForFonts(page);

    const found = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      // innerText: what a visitor can see, so the closed mobile menu and the scripts stay out.
      lines: document.body.innerText.split("\n").filter((line) => line.includes("[")),
    }));

    expect(found.lines, `visible placeholders on ${route}`).toEqual([]);
    expect(found.title, `title of ${route}`).not.toContain("[");
    expect(found.description, `description of ${route}`).not.toContain("[");
  });
}
