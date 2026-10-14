import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// @axe-core/playwright bundles its own, newer playwright-core, whose `Page` type has methods
// that @playwright/test 1.56.1 (pinned to the container's Chromium) lacks. Same runtime API.
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];

/**
 * Runs axe-core (every rule) on the whole page and fails with a readable list:
 * one line per violation, then the selector of each offending node.
 */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  const report = results.violations
    .map((violation) => {
      const nodes = violation.nodes.map((node) => `    ${node.target.map(String).join(" ")}`).join("\n");
      return `${violation.id} [${violation.impact ?? "n/a"}] ${violation.help}\n${nodes}`;
    })
    .join("\n");
  expect(results.violations, report).toEqual([]);
}

/** Waits for the self-hosted fonts, so screenshots do not catch the fallback face. */
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** `screenshots/<route>-<project>.png`, relative to the repository root; "/" becomes "home". */
export function screenshotPath(route: string, project: string): string {
  const slug = route === "/" ? "home" : route.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
  return path.join("screenshots", `${slug}-${project}.png`);
}
