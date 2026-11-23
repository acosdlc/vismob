import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
import { SiteNav } from "./SiteNav";

// Header.test.tsx covers the links and the mobile menu; this file covers the analytics
// (ARHITECTURA §10): both tel: links of the header report phone_click { place: "header" }.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const tracked = vi.mocked(track);
const PHONE = "0722 123 456";

beforeEach(() => {
  tracked.mockReset();
});

describe("SiteNav analytics", () => {
  it("reports phone_click from the header phone link and keeps the tel: href", () => {
    const { container } = render(<SiteNav phone={PHONE} />);
    container.addEventListener("click", (event) => event.preventDefault()); // jsdom cannot navigate
    const link = screen.getByRole("link", { name: PHONE });
    expect(link).toHaveAttribute("href", "tel:0722123456");

    fireEvent.click(link);
    expect(tracked).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveBeenCalledWith("phone_click", { place: "header" });
  });

  it("reports phone_click from the mobile menu's „Sună acum” button", () => {
    const { container } = render(<SiteNav phone={PHONE} />);
    container.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(screen.getByRole("button", { name: "Meniu" }));
    const panel = screen.getByRole("navigation", { name: "Meniu" });
    const call = within(panel).getByRole("link", { name: "Sună acum" });
    expect(call).toHaveAttribute("href", "tel:0722123456");

    fireEvent.click(call);
    expect(tracked).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveBeenCalledWith("phone_click", { place: "header" });
  });

  it("reports nothing for the navigation links, the CTA and the menu button", () => {
    const { container } = render(<SiteNav phone={PHONE} />);
    container.addEventListener("click", (event) => event.preventDefault());
    const nav = screen.getByRole("navigation", { name: "Principal" });
    fireEvent.click(within(nav).getByRole("link", { name: "Contact" }));
    fireEvent.click(screen.getByRole("link", { name: "Cere ofertă" }));
    fireEvent.click(screen.getByRole("button", { name: "Meniu" }));
    expect(tracked).not.toHaveBeenCalled();
  });
});
