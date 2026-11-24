import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapEmbed } from "@/components/contact/MapEmbed";
import { Photo } from "./Photo";
import { PhotoPlaceholder } from "./PhotoPlaceholder";

// The placeholder gate (tests/e2e/no-placeholders.spec.ts) fails on every visible element
// that carries this mark: a FOTO box has no `[` for the gate's text check to find.
const MARK = '[data-placeholder="photo"]';

describe("PhotoPlaceholder", () => {
  it("marks its box for the placeholder gate, with a label or without", () => {
    const labelled = render(
      <PhotoPlaceholder ratio="5:4" label="FOTO 01" frame="Pat finalizat, în dormitorul unui client." />,
    );
    const box = labelled.container.querySelector(MARK);
    expect(box).toHaveClass("photo-placeholder");
    expect(box).toHaveTextContent("FOTO 01");
    labelled.unmount();

    const bare = render(<PhotoPlaceholder ratio="4:3" />);
    expect(bare.container.querySelectorAll(MARK)).toHaveLength(1);
  });

  it("is marked when a photo has no src, and a photo with one carries no mark", () => {
    const missing = render(<Photo alt="Oamenii din atelier, la lucru" ratio="4:5" label="FOTO 08" />);
    expect(missing.container.querySelectorAll(MARK)).toHaveLength(1);
    missing.unmount();

    const real = render(<Photo src="/foto/08.jpg" alt="Oamenii din atelier, la lucru" ratio="4:5" label="FOTO 08" />);
    expect(real.container.querySelector("img")).not.toBeNull();
    expect(real.container.querySelector("[data-placeholder]")).toBeNull();
  });

  it("leaves the click-to-load map box unmarked, although it is hatched the same way", () => {
    const { container } = render(<MapEmbed address="[Strada, nr., Localitate]" height={220} />);
    expect(container.querySelector(".photo-placeholder")).not.toBeNull();
    expect(container.querySelector("[data-placeholder]")).toBeNull();
  });
});
