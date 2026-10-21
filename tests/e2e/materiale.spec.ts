import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// PR-6 acceptance for /materiale (DESIGN §4.3, §3.10): the page opens with the H1 and no
// axe violations at 1440×900 and 390×844; the tabs switch with the mouse and the keyboard;
// every swatch is a link that opens the configurator with that colour preselected.

const H1 = "Materiale";

test("/materiale: accessible, with the tabs and their counters, captured", async ({ page }, testInfo) => {
  const response = await page.goto("/materiale");
  expect(response, "no response for /materiale").not.toBeNull();
  expect(response!.status()).toBe(200);

  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page.getByRole("heading", { level: 1, name: H1 })).toBeVisible();
  await expect(page.getByText(/^Tot ce vezi aici se poate alege în configurator\./)).toBeVisible();
  await expect(page.getByText(/trimitem acasă|Cutia cu mostre|Cere mostre/)).toHaveCount(0);

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText([/Textile\s*4 familii/, /Lemn masiv\s*5 esențe/, /Picioare și baze\s*3/]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByRole("heading", { level: 2 })).toHaveText([
    "Catifea",
    "Bouclé",
    "Stofă",
    "Piele ecologică",
  ]);
  await expect(page.getByRole("tabpanel").getByRole("link")).toHaveCount(19);

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
  await expect(panel.getByRole("link")).toHaveCount(5);
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

test("a swatch opens the configurator with its family and colour preselected", async ({ page }) => {
  await page.goto("/materiale");
  await page.getByRole("link", { name: /Nisip/ }).click();
  await expect(page).toHaveURL(/\/configurator\?.*f=boucle.*c=bc-nisip/);
  await expect(page.getByRole("heading", { level: 1, name: "Configurează-ți patul" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nisip", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/materiale");
  await page.getByRole("tab", { name: /Lemn masiv/ }).click();
  await page.getByRole("link", { name: /^Nuc/ }).click();
  await expect(page).toHaveURL(/\/configurator\?.*m=lamele.*f=lemn.*c=lm-nuc/);
});
