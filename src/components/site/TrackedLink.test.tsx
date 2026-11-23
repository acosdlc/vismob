import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
import { TrackedLink } from "./TrackedLink";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const tracked = vi.mocked(track);

beforeEach(() => {
  tracked.mockReset();
});

describe("TrackedLink", () => {
  it("renders the Button link with its href, target, rel and classes, and reports nothing on render", () => {
    render(
      <TrackedLink
        event="whatsapp_click"
        properties={{ place: "contact" }}
        href="https://wa.me/40722123456"
        variant="primary"
        className="flex-[1_1_200px]"
        target="_blank"
        rel="noreferrer"
      >
        Scrie-ne pe WhatsApp
      </TrackedLink>,
    );
    const link = screen.getByRole("link", { name: "Scrie-ne pe WhatsApp" });
    expect(link).toHaveAttribute("href", "https://wa.me/40722123456");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link.className).toContain("bg-accent");
    expect(link.className).toContain("flex-[1_1_200px]");
    expect(link).not.toHaveAttribute("event");
    expect(tracked).not.toHaveBeenCalled();
  });

  it("reports the event on click and lets the navigation go on", () => {
    const prevented: boolean[] = [];
    const { container } = render(
      <TrackedLink
        event="phone_click"
        properties={{ place: "contact" }}
        href="tel:0722123456"
        variant="secondary"
        onClick={(e) => prevented.push(e.defaultPrevented)}
      >
        Sună acum
      </TrackedLink>,
    );
    container.addEventListener("click", (e) => e.preventDefault()); // jsdom cannot navigate
    const link = screen.getByRole("link", { name: "Sună acum" });
    expect(link).toHaveAttribute("href", "tel:0722123456");
    expect(link.className).toContain("border-ink");

    fireEvent.click(link);
    expect(tracked).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveBeenCalledWith("phone_click", { place: "contact" });
    // The wrapper neither prevented the default nor swallowed the caller's onClick.
    expect(prevented).toEqual([false]);
  });
});
