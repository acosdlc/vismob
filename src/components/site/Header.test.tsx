import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";
import { Header } from "./Header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/lucrari",
}));

const EXPECTED = [
  ["Lucrări", "/lucrari"],
  ["Modele", "/#modele"],
  ["Materiale", "/materiale"],
  ["Configurator", "/configurator"],
  ["Atelierul", "/#atelier"],
  ["Contact", "/contact"],
];

describe("Header", () => {
  it("renders the logo, the six links with their hrefs, the phone and the CTA", () => {
    render(<Header settings={SEED_SETTINGS} />);

    const logo = screen.getByRole("link", { name: `${SEED_SETTINGS.workshop_name} Paturi la comandă` });
    expect(logo).toHaveAttribute("href", "/");

    const nav = screen.getByRole("navigation", { name: "Principal" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(EXPECTED);

    expect(within(nav).getByRole("link", { name: "Lucrări" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Materiale" })).not.toHaveAttribute("aria-current");

    expect(screen.getByRole("link", { name: SEED_SETTINGS.phone_public })).toHaveAttribute(
      "href",
      "tel:[07xxxxxxxx]",
    );
    expect(screen.getByRole("link", { name: "Cere ofertă" })).toHaveAttribute("href", "/contact");
  });

  it("toggles the mobile menu: aria-expanded, the „Închide” label and the panel", () => {
    render(<Header settings={SEED_SETTINGS} />);
    const toggle = screen.getByRole("button", { name: "Meniu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "meniu-mobil");
    expect(screen.queryByRole("navigation", { name: "Meniu" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Închide");

    const panel = screen.getByRole("navigation", { name: "Meniu" });
    expect(panel).toHaveAttribute("id", "meniu-mobil");
    const links = within(panel).getAllByRole("link");
    expect(links.slice(0, 6).map((a) => [a.textContent, a.getAttribute("href")])).toEqual(EXPECTED);
    expect(within(panel).getByRole("link", { name: "Cere ofertă" })).toHaveAttribute("href", "/contact");
    expect(within(panel).getByRole("link", { name: "Sună acum" })).toHaveAttribute("href", "tel:[07xxxxxxxx]");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Meniu");
    expect(screen.queryByRole("navigation", { name: "Meniu" })).toBeNull();
  });

  it("closes on Escape and returns focus to the button", () => {
    render(<Header settings={SEED_SETTINGS} />);
    const toggle = screen.getByRole("button", { name: "Meniu" });
    fireEvent.click(toggle);
    const firstLink = within(screen.getByRole("navigation", { name: "Meniu" })).getAllByRole("link")[0];
    firstLink.focus();
    expect(document.activeElement).toBe(firstLink);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Meniu" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("closes when a menu link is clicked", () => {
    render(<Header settings={SEED_SETTINGS} />);
    fireEvent.click(screen.getByRole("button", { name: "Meniu" }));
    const panel = screen.getByRole("navigation", { name: "Meniu" });
    panel.addEventListener("click", (event) => event.preventDefault()); // jsdom cannot navigate
    fireEvent.click(within(panel).getByRole("link", { name: "Contact" }));
    expect(screen.queryByRole("navigation", { name: "Meniu" })).toBeNull();
  });

  it("drops the „Cere ofertă” header button for variant tool", () => {
    render(<Header settings={SEED_SETTINGS} variant="tool" />);
    expect(screen.queryByRole("link", { name: "Cere ofertă" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });
});
