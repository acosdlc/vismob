import { expect, test } from "@playwright/test";
import { FORM_MESSAGES } from "@/lib/leads/types";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// PR-3 acceptance for /configurator (DESIGN §4.2, §5, §7): the page opens with the H1 and
// no axe violations at 1440×900 and 390×844; an option changes the URL and the code; „Altă
// dimensiune” reveals the inputs; a configuration in the URL is restored; the mobile bar
// appears once the drawing has scrolled away; the quote form carries the code and
// validates on the client. The submit itself needs the Vercel preview (Supabase, Resend).

const H1 = "Configurează-ți patul";
const ticketCode = (page: import("@playwright/test").Page) => page.getByTestId("ticket-code");

test("/configurator: accessible and captured", async ({ page }, testInfo) => {
  const response = await page.goto("/configurator");
  expect(response, "no response for /configurator").not.toBeNull();
  expect(response!.status()).toBe(200);

  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page.getByRole("heading", { level: 1, name: H1 })).toBeVisible();
  await expect(page.getByText("6 pași · aproximativ 2 minute")).toBeVisible();
  await expect(page.getByText("Desen la scară · vedere din față").first()).toBeVisible();
  await expect(page.getByText("Fișă de configurare")).toBeVisible();
  await expect(ticketCode(page)).toHaveText("CAP-160x200-CT01-H120-PL");
  await expect(ticketCode(page)).toHaveAttribute("aria-live", "polite");

  // Six steps, each a fieldset with its legend (§7).
  const legends = page.locator("fieldset legend");
  await expect(legends).toHaveText([
    /01\s*Model/,
    /02\s*Dimensiunea saltelei/,
    /03\s*Material și culoare/,
    /04\s*Înălțimea tăbliei/,
    /05\s*Baza patului/,
    /06\s*Extra/,
  ]);
  await expect(page.getByRole("button", { name: /^Capitonat/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("figure svg").first()).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByText("Prețul final îl confirmăm în scris, după o discuție scurtă.")).toBeVisible();

  await waitForFonts(page);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: screenshotPath("/configurator", testInfo.project.name), fullPage: true });
});

test("choosing „Arcuit” writes ?m=arcuit to the URL and an ARC- code to the ticket", async ({ page }) => {
  await page.goto("/configurator");
  await page.getByRole("button", { name: /^Arcuit/ }).click();
  await expect(page).toHaveURL(/[?&]m=arcuit(&|$)/);
  await expect(page.getByRole("button", { name: /^Arcuit/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Capitonat/ })).toHaveAttribute("aria-pressed", "false");
  await expect(ticketCode(page)).toHaveText(/^ARC-/);
  await expect(page.locator("figcaption").first()).toContainText("Arcuit");
  await expectNoAxeViolations(page);
});

test("„Altă dimensiune” reveals the two inputs and the code follows them", async ({ page }) => {
  await page.goto("/configurator");
  await expect(page.getByLabel("Lățime saltea (cm)")).toHaveCount(0);
  await page.getByRole("button", { name: "Altă dimensiune", exact: true }).click();
  const width = page.getByLabel("Lățime saltea (cm)");
  const length = page.getByLabel("Lungime saltea (cm)");
  await expect(width).toBeVisible();
  await expect(length).toBeVisible();
  await expect(width).toHaveAttribute("min", "80");
  await expect(width).toHaveAttribute("max", "220");
  await expect(length).toHaveAttribute("min", "180");
  await expect(length).toHaveAttribute("max", "220");
  await width.fill("135");
  await expect(ticketCode(page)).toHaveText(/^CAP-135x200-/);
  await expect(page).toHaveURL(/[?&]s=custom(&|$)/);
  await expect(page).toHaveURL(/[?&]w=135(&|$)/);
});

test("/configurator?m=lamele&c=lm-nuc restores Lamele in Nuc", async ({ page }) => {
  await page.goto("/configurator?m=lamele&c=lm-nuc");
  await expect(page.getByRole("button", { name: /^Lamele/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Nuc", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Lemn masiv", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("figcaption").first()).toContainText("nuc");
  await expect(ticketCode(page)).toHaveText("LAM-160x200-LM03-H120-PL");
});

test("under 960px the fixed bar appears after the drawing scrolls away", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the bar exists only under 960px (DESIGN §5.8)");
  await page.goto("/configurator");
  const bar = page.getByTestId("mobile-bar");
  await expect(bar).toHaveAttribute("data-state", "hidden");

  // Scroll to step 04: the drawing is above the viewport, the quote section below.
  await page.locator("fieldset").nth(3).scrollIntoViewIfNeeded();
  await expect(bar).toHaveAttribute("data-state", "shown");
  await expect(bar.getByTestId("mobile-bar-code")).toHaveText("CAP-160x200-CT01-H120-PL");
  await expect(bar.getByRole("link", { name: "Cere ofertă", exact: true })).toHaveAttribute("href", "#cerere");

  // Back at the top the bar hides; at the quote section it hides too (it never covers the submit).
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toHaveAttribute("data-state", "hidden");
  await page.locator("#cerere").scrollIntoViewIfNeeded();
  await expect(bar).toHaveAttribute("data-state", "hidden");
});

test("the quote section carries the attached code and validates the empty form on the client", async ({ page }) => {
  await page.goto("/configurator?m=canale&b=lada");
  const code = await ticketCode(page).textContent();
  expect(code).toMatch(/^CAN-160x200-.*-LD$/);

  const section = page.locator("#cerere");
  await expect(section.getByRole("heading", { level: 2, name: "Primești oferta finală după o discuție scurtă." })).toBeVisible();
  await expect(section.getByText("Configurația atașată")).toBeVisible();
  await expect(section.getByText(code!).first()).toBeVisible();

  const form = section.locator("form");
  await expect(form).toHaveAttribute("novalidate", "");
  const name = form.getByLabel("Nume");
  await form.getByRole("button", { name: "Trimite configurația", exact: true }).click();

  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(form.getByText(FORM_MESSAGES.required).first()).toBeVisible();
  await expect(form.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/configurator\?/);
  await expectNoAxeViolations(page);
});
