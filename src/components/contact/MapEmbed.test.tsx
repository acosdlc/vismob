import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapEmbed, mapUrls } from "./MapEmbed";

const ADDRESS = "[Strada, nr., Localitate]";

describe("MapEmbed", () => {
  it("shows only the placeholder box and the button before the click", () => {
    const { container } = render(<MapEmbed address={ADDRESS} height={220} />);
    expect(container.querySelector("iframe")).toBeNull();
    const box = screen.getByTestId("map-placeholder");
    expect(box.className).toContain("photo-placeholder");
    expect(box).toHaveStyle({ height: "220px" });
    expect(screen.getByRole("button", { name: "Arată harta" })).toBeInTheDocument();
  });

  it("loads the Google Maps iframe of the same height, and the link, after the click", () => {
    const { container } = render(<MapEmbed address={ADDRESS} height={400} />);
    fireEvent.click(screen.getByRole("button", { name: "Arată harta" }));

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute("title", "Hartă");
    expect(iframe).toHaveAttribute("loading", "lazy");
    expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer-when-downgrade");
    expect(iframe).toHaveAttribute("src", mapUrls(ADDRESS).embed);
    expect(iframe).toHaveStyle({ height: "400px" });
    expect(screen.queryByRole("button", { name: "Arată harta" })).toBeNull();

    const link = screen.getByRole("link", { name: "Deschide în Google Maps" });
    expect(link).toHaveAttribute("href", mapUrls(ADDRESS).open);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("encodes the address in both URLs", () => {
    const urls = mapUrls("Str. Lungă 10, Cluj");
    expect(urls.embed).toBe("https://www.google.com/maps?q=Str.%20Lung%C4%83%2010%2C%20Cluj&output=embed");
    expect(urls.open).toBe("https://www.google.com/maps/search/?api=1&query=Str.%20Lung%C4%83%2010%2C%20Cluj");
  });
});
