import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";
import { Footer } from "./Footer";

// cacheLife() only runs inside Next's cache scope.
vi.mock("next/cache", () => ({ cacheLife: () => undefined }));

const YEAR = String(new Date().getFullYear());

describe("Footer", () => {
  it("full: legal row with the year, legal name, CUI, registration and office, plus the legal links", async () => {
    render(await Footer({ settings: SEED_SETTINGS }));
    const legal = screen.getByText((_, el) => el?.tagName === "P" && /^© /.test(el.textContent ?? ""));
    expect(legal).toHaveTextContent(
      `© ${YEAR} ${SEED_SETTINGS.legal_name} · CUI ${SEED_SETTINGS.cui} · ${SEED_SETTINGS.reg_com} · ${SEED_SETTINGS.registered_office}`,
    );
    expect(screen.getByRole("link", { name: "Confidențialitate" })).toHaveAttribute("href", "/confidentialitate");
    expect(screen.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies");
    expect(screen.getByRole("link", { name: "Termeni" })).toHaveAttribute("href", "/termeni");
  });

  it("full: brand line, the Pagini nav and the contact links", async () => {
    render(await Footer({ settings: SEED_SETTINGS }));
    expect(
      screen.getByText(`Paturi construite la comandă, în atelierul din ${SEED_SETTINGS.city}.`),
    ).toBeInTheDocument();
    const pages = screen.getByRole("navigation", { name: "Pagini" });
    expect(within(pages).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/lucrari",
      "/materiale",
      "/configurator",
      "/contact",
    ]);
    expect(screen.getByRole("link", { name: SEED_SETTINGS.phone_public })).toHaveAttribute(
      "href",
      "tel:[07xxxxxxxx]",
    );
    expect(screen.getByRole("link", { name: SEED_SETTINGS.email_public })).toHaveAttribute(
      "href",
      `mailto:${SEED_SETTINGS.email_public}`,
    );
  });

  it("hides Instagram and Facebook when their URLs are empty, shows them when filled", async () => {
    const { unmount } = render(await Footer({ settings: SEED_SETTINGS }));
    expect(screen.queryByRole("link", { name: "Instagram" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Facebook" })).toBeNull();
    unmount();

    render(
      await Footer({
        settings: { ...SEED_SETTINGS, instagram_url: "https://instagram.com/atelier" },
      }),
    );
    expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/atelier");
    expect(screen.queryByRole("link", { name: "Facebook" })).toBeNull();
  });

  it("compact: one row with workshop name, legal name and CUI, plus the legal links", async () => {
    render(await Footer({ settings: SEED_SETTINGS, variant: "compact" }));
    expect(
      screen.getByText(`© ${YEAR} ${SEED_SETTINGS.workshop_name} · ${SEED_SETTINGS.legal_name} · CUI ${SEED_SETTINGS.cui}`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("link", { name: "Termeni" })).toHaveAttribute("href", "/termeni");
  });
});
