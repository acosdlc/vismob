import { expect, test } from "@playwright/test";
import { FORM_MESSAGES } from "@/lib/leads/types";
import { expectNoAxeViolations, screenshotPath, waitForFonts } from "./axe";

// PR-2 acceptance for /contact (DESIGN §4.5, §4.1 09, §3.16): the page opens with an
// H1, has no axe violations at 1440×900 and 390×844, and the empty form fails on the
// client with the focus on the first invalid field. The submit itself needs the
// Vercel preview (Supabase, Resend): the container has no secrets.

test("/contact: accessible and captured", async ({ page }, testInfo) => {
  const response = await page.goto("/contact");
  expect(response, "no response for /contact").not.toBeNull();
  expect(response!.status()).toBe(200);

  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page.getByRole("heading", { level: 1, name: "Spune-ne ce pat îți dorești." })).toBeVisible();
  await expect(page.getByText("Cerere de ofertă")).toBeVisible();
  await expect(page.getByRole("button", { name: "Arată harta" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  await waitForFonts(page);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: screenshotPath("/contact", testInfo.project.name), fullPage: true });
});

test("submitting the empty form shows the name error and keeps the focus in the form", async ({ page }) => {
  await page.goto("/contact");
  const form = page.locator("form");
  const name = form.getByLabel("Nume");
  // The hydrated form validates with Zod on the client (noValidate), not with the browser bubbles.
  await expect(form).toHaveAttribute("novalidate", "");

  await form.getByRole("button", { name: "Trimite cererea" }).click();

  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(form.getByText(FORM_MESSAGES.required).first()).toBeVisible();
  await expect(form.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByRole("checkbox", { name: /Sunt de acord/ })).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/contact$/);

  // Errors keep the page accessible.
  await expectNoAxeViolations(page);
});

test("the map loads only after „Arată harta” is clicked", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Arată harta" }).click();
  const iframe = page.locator("iframe[title='Hartă']");
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute("src", /google\.com\/maps\?q=.*&output=embed/);
  await expect(page.getByRole("link", { name: "Deschide în Google Maps" })).toBeVisible();
});
