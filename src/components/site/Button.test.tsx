import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

// next/link is marked so the test can tell it apart from a plain anchor.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}));

describe("Button", () => {
  it("renders an internal href through next/link, with the arrow icon", () => {
    render(
      <Button href="/configurator" arrow>
        Configurează-ți patul
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Configurează-ți patul" });
    expect(link).toHaveAttribute("href", "/configurator");
    expect(link).toHaveAttribute("data-next-link");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders tel:, mailto:, wa.me and http hrefs as plain anchors", () => {
    render(
      <>
        <Button href="tel:0722000000">Sună acum</Button>
        <Button href="mailto:x@y.ro">Email</Button>
        <Button href="https://wa.me/40722000000">WhatsApp</Button>
        <Button href="https://instagram.com/x">Instagram</Button>
      </>,
    );
    for (const name of ["Sună acum", "Email", "WhatsApp", "Instagram"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("data-next-link");
    }
    expect(screen.getByRole("link", { name: "Sună acum" })).toHaveAttribute("href", "tel:0722000000");
  });

  it("renders a <button type=button> without href, and keeps an explicit type", () => {
    render(
      <>
        <Button onClick={() => undefined}>Deschide</Button>
        <Button type="submit">Trimite cererea</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Deschide" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Trimite cererea" })).toHaveAttribute("type", "submit");
  });

  it("applies the variant and size classes", () => {
    render(
      <>
        <Button variant="secondary" size="header">
          Meniu
        </Button>
        <Button variant="link">Configurează</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Meniu" }).className).toContain("min-h-[46px]");
    expect(screen.getByRole("button", { name: "Meniu" }).className).toContain("border-ink");
    expect(screen.getByRole("button", { name: "Configurează" }).className).toContain("underline");
  });
});
