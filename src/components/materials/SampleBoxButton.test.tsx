import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleBoxButton } from "./SampleBoxButton";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers = new Map<Element, Callback>();

class FakeObserver {
  constructor(private cb: Callback) {}
  observe(el: Element) {
    observers.set(el, this.cb);
  }
  disconnect() {
    observers.clear();
  }
}

function intersect(el: Element, isIntersecting: boolean) {
  act(() => observers.get(el)?.([{ isIntersecting }]));
}

function setup(count: number) {
  const targetRef = createRef<HTMLDivElement>();
  const view = render(
    <>
      <div ref={targetRef} data-testid="box" />
      <SampleBoxButton count={count} targetRef={targetRef} />
    </>,
  );
  return { ...view, box: screen.getByTestId("box") };
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  observers.clear();
});

describe("SampleBoxButton", () => {
  it("is hidden while the box is in view and appears, bottom-right, once it has left", () => {
    const { box } = setup(2);
    const wrapper = screen.getByTestId("sample-box-button");
    expect(wrapper).toHaveAttribute("data-state", "hidden");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(wrapper.className).toContain("nav:hidden");
    expect(wrapper.className).toContain("fixed");
    expect(wrapper.className).toContain("right-");
    expect(wrapper.className).toContain("env(safe-area-inset-bottom)");
    expect(screen.getByRole("link", { name: "Cutia (2)", hidden: true })).toHaveAttribute("tabindex", "-1");

    intersect(box, false);
    expect(wrapper).toHaveAttribute("data-state", "shown");
    expect(wrapper).not.toHaveAttribute("aria-hidden", "true");
    const link = screen.getByRole("link", { name: "Cutia (2)" });
    expect(link).toHaveAttribute("href", "#cutie");
    expect(link).not.toHaveAttribute("tabindex");
    // Secondary style on a white surface.
    expect(link.className).toContain("border-ink");
    expect(link.className).toContain("bg-white");

    intersect(box, true);
    expect(wrapper).toHaveAttribute("data-state", "hidden");
  });

  it("stays hidden while the box is empty, whatever the scroll position, and shows once it holds something", () => {
    const { box, rerender } = setup(0);
    intersect(box, false);
    const wrapper = screen.getByTestId("sample-box-button");
    expect(wrapper).toHaveAttribute("data-state", "hidden");
    expect(screen.getByRole("link", { name: "Cutia (0)", hidden: true })).toHaveAttribute("tabindex", "-1");

    const targetRef = { current: box };
    rerender(
      <>
        <div data-testid="box" />
        <SampleBoxButton count={1} targetRef={targetRef} />
      </>,
    );
    // The box is still out of view (the observer last reported so): one sample shows the button.
    expect(wrapper).toHaveAttribute("data-state", "shown");
    expect(screen.getByRole("link", { name: "Cutia (1)" })).not.toHaveAttribute("tabindex");
  });

  it("renders without IntersectionObserver (older browsers, jsdom)", () => {
    vi.unstubAllGlobals();
    expect(() => setup(3)).not.toThrow();
    expect(screen.getByTestId("sample-box-button")).toHaveAttribute("data-state", "hidden");
  });
});
