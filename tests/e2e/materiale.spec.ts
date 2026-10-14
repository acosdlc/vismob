import { expect, test, type Page } from "@playwright/test";
import { FORM_MESSAGES } from "@/lib/leads/types";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// PR-4 acceptance for /materiale (DESIGN §4.3, §3.10, §6, §7): the page opens with the H1 and
// no axe violations at 1440×900 and 390×844; the tabs switch; five tiles fill the box and the
// sixth reads „cutia e plină”; a removal frees a slot; the box survives a reload
// (localStorage `mostre:v1`); the samples form validates on the client; under 960px the fixed
// „Cutia (1)” button appears once the box is out of view. The submit itself needs the Vercel
// preview (Supabase, Resend), so only the validation is tested here.

const H1 = "Materiale";
const tile = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const box = (page: Page) => page.locator("#cutie");
const count = (page: Page) => page.getByTestId("box-count");

const CATIFEA = ["Verde sticlă", "Bleumarin", "Muștar", "Roz pudrat", "Antracit"] as const;

test("/materiale: accessible, with the tabs and their counters, captured", async ({ page }, testInfo) => {
  const response = await page.goto("/materiale");
  expect(response, "no response for /materiale").not.toBeNull();
  expect(response!.status()).toBe(200);

  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page.getByRole("heading", { level: 1, name: H1 })).toBeVisible();
  await expect(page.getByText(/^Tot ce vezi aici se poate alege în configurator\./)).toBeVisible();

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText([/Textile\s*4 familii/, /Lemn masiv\s*5 esențe/, /Picioare și baze\s*3/]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByRole("heading", { level: 2 })).toHaveText([
    "Catifea",
    "Bouclé",
    "Stofă",
    "Piele ecologică",
  ]);
  await expect(tile(page, "Verde sticlă")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("+ adaugă mostra").first()).toBeVisible();
  await expect(box(page).getByText("Cutia cu mostre")).toBeVisible();
  await expect(count(page)).toHaveText("0 / 5");
  await expect(box(page).getByText("Apasă pe mostrele care îți plac. Poți alege până la 5.")).toBeVisible();

  await waitForFonts(page);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: screenshotPath("/materiale", testInfo.project.name), fullPage: true });
});

test("the tabs switch: Lemn masiv shows the species and the finishes, Picioare și baze the three cards", async ({ page }) => {
  await page.goto("/materiale");
  await page.getByRole("tab", { name: /Lemn masiv/ }).click();
  await expect(page.getByRole("tab", { name: /Lemn masiv/ })).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(["Lemn masiv", "Finisaje pentru lemn"]);
  await expect(panel.getByRole("button", { pressed: false })).toHaveCount(5);
  await expect(panel.getByText("Ulei natural")).toBeVisible();
  await expect(panel.getByText("Protecție mai bună la pete și zgârieturi.")).toBeVisible();

  await page.getByRole("tab", { name: /Picioare și baze/ }).click();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText(["Picioare din lemn", "Picioare metalice", "Bază până la podea"]);
  await expect(panel.getByText("Pentru ladă de depozitare sau sertare, cu plintă retrasă.")).toBeVisible();
  await expectNoAxeViolations(page);

  // Keyboard: Right from the last tab wraps to the first.
  await page.getByRole("tab", { name: /Picioare și baze/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Textile/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Textile/ })).toBeFocused();
});

test("five tiles fill the box, the sixth reads „cutia e plină”, a removal frees a slot, and a reload keeps the box", async ({ page }) => {
  await page.goto("/materiale");
  for (const name of CATIFEA) {
    await tile(page, name).click();
    await expect(tile(page, name)).toHaveAttribute("aria-pressed", "true");
  }
  await expect(count(page)).toHaveText("5 / 5");
  await expect(tile(page, "Verde sticlă")).toContainText("în cutie · CT01");
  await expect(page.getByTestId("box-announcer")).toHaveText("Antracit adăugată în cutie");

  const sixth = tile(page, "Cărămiziu");
  await expect(sixth).toContainText("cutia e plină");
  await expect(sixth).toHaveAttribute("aria-pressed", "false");
  await expect(sixth).toHaveAttribute("aria-disabled", "true");
  // Playwright treats aria-disabled as not clickable; a visitor's click still lands and must do nothing.
  await sixth.click({ force: true });
  await expect(sixth).toHaveAttribute("aria-pressed", "false");
  await expect(count(page)).toHaveText("5 / 5");
  await expect(box(page).getByText("Cutia e plină. Scoate o mostră ca să adaugi alta.")).toBeVisible();

  // Removing from the box frees a slot and the sixth tile offers itself again.
  await box(page).getByRole("button", { name: "Scoate Verde sticlă", exact: true }).click();
  await expect(count(page)).toHaveText("4 / 5");
  await expect(page.getByTestId("box-announcer")).toHaveText("Verde sticlă scoasă din cutie");
  // The focus moves on to the next row's button instead of falling to <body>.
  await expect(box(page).getByRole("button", { name: "Scoate Bleumarin", exact: true })).toBeFocused();
  await expect(tile(page, "Verde sticlă")).toHaveAttribute("aria-pressed", "false");
  await expect(sixth).toContainText("+ adaugă mostra");
  await expect(sixth).not.toHaveAttribute("aria-disabled", "true");

  // localStorage `mostre:v1` (DESIGN §4.3): the box survives a reload.
  await page.reload();
  await expect(count(page)).toHaveText("4 / 5");
  for (const name of CATIFEA.slice(1)) {
    await expect(tile(page, name)).toHaveAttribute("aria-pressed", "true");
  }
  await expect(tile(page, "Verde sticlă")).toHaveAttribute("aria-pressed", "false");
  const stored = await page.evaluate(() => window.localStorage.getItem("mostre:v1"));
  expect(JSON.parse(stored ?? "null")).toEqual({ ids: ["ct-bleumarin", "ct-mustar", "ct-roz", "ct-antracit"] });
  await expectNoAxeViolations(page);
});

test("the samples form validates the empty form on the client, focus on „Nume”", async ({ page }) => {
  await page.goto("/materiale");
  await tile(page, "Nisip").click();
  await expect(count(page)).toHaveText("1 / 5");

  const form = box(page).locator("form");
  await expect(form).toHaveAttribute("novalidate", "");
  const name = form.getByLabel("Nume", { exact: true });
  await form.getByRole("button", { name: "Trimite-mi mostrele", exact: true }).click();

  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(form.getByText(FORM_MESSAGES.required).first()).toBeVisible();
  await expect(form.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByLabel("Adresa de livrare", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/materiale$/);
  await expectNoAxeViolations(page);
});

test("under 960px the fixed „Cutia (1)” button appears once a tile is added and the box is out of view", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the fixed button exists only under 960px (DESIGN §6)");
  await page.goto("/materiale");
  const fixedButton = page.getByTestId("sample-box-button");
  await expect(fixedButton).toHaveAttribute("data-state", "hidden");

  // At the top the box (under the content on mobile) is out of view: one tile shows the button.
  await page.evaluate(() => window.scrollTo(0, 0));
  await tile(page, "Verde sticlă").click();
  await expect(fixedButton).toHaveAttribute("data-state", "shown");
  const link = fixedButton.getByRole("link", { name: "Cutia (1)", exact: true });
  await expect(link).toHaveAttribute("href", "#cutie");

  // It leads to the box, where it hides again (the box is in view).
  await link.click();
  await expect(box(page)).toBeInViewport();
  await expect(fixedButton).toHaveAttribute("data-state", "hidden");
});
