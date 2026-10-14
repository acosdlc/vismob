import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqSection } from "@/components/home/FaqSection";
import { Reviews } from "@/components/home/Reviews";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";

describe("home sections", () => {
  it("hides the price question while prices are not public", () => {
    render(<FaqSection settings={{ ...SEED_SETTINGS, show_prices: false }} />);
    expect(screen.queryByText("Cât costă un pat la comandă?")).not.toBeInTheDocument();
    expect(screen.getByText("Cât durează?")).toBeInTheDocument();
  });

  it("renders nothing for the reviews section without reviews", () => {
    const { container } = render(<Reviews reviews={[]} settings={SEED_SETTINGS} />);
    expect(container).toBeEmptyDOMElement();
  });
});
