import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_CATALOG, DEFAULT_CONFIG } from "@/lib/configurator/catalog.seed";
import { resolve } from "@/lib/configurator/rules";
import { MobileBar } from "./MobileBar";

vi.mock("@/components/drawings/BedDrawing", () => ({
  BedDrawing: ({ className }: { className?: string }) => <svg data-testid="bed-drawing" className={className} />,
}));

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

const resolved = resolve(DEFAULT_CONFIG, SEED_CATALOG);

function setup(price: string | null = null) {
  const figureRef = createRef<HTMLDivElement>();
  const quoteRef = createRef<HTMLDivElement>();
  const view = render(
    <>
      <div ref={figureRef} data-testid="figure" />
      <div ref={quoteRef} data-testid="quote" />
      <MobileBar resolved={resolved} price={price} figureRef={figureRef} quoteRef={quoteRef} />
    </>,
  );
  return { ...view, figure: screen.getByTestId("figure"), quote: screen.getByTestId("quote") };
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  observers.clear();
});

describe("MobileBar", () => {
  it("is hidden while the drawing is in view and appears once it has left", () => {
    const { figure } = setup();
    const bar = screen.getByTestId("mobile-bar");
    expect(bar).toHaveAttribute("data-state", "hidden");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar.className).toContain("nav:hidden");
    expect(bar.className).toContain("env(safe-area-inset-bottom)");
    expect(screen.getByRole("link", { name: "Cere ofertă", hidden: true })).toHaveAttribute("tabindex", "-1");

    intersect(figure, false);
    expect(bar).toHaveAttribute("data-state", "shown");
    expect(bar).not.toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("mobile-bar-code")).toHaveTextContent("CAP-160x200-CT01-H120-PL");
    expect(screen.getByTestId("bed-drawing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cere ofertă" })).toHaveAttribute("href", "#cerere");
    expect(screen.getByRole("link", { name: "Cere ofertă" })).not.toHaveAttribute("tabindex");

    intersect(figure, true);
    expect(bar).toHaveAttribute("data-state", "hidden");
  });

  it("hides again while the quote section is in view, so it never covers its submit button", () => {
    const { figure, quote } = setup();
    intersect(figure, false);
    expect(screen.getByTestId("mobile-bar")).toHaveAttribute("data-state", "shown");
    intersect(quote, true);
    expect(screen.getByTestId("mobile-bar")).toHaveAttribute("data-state", "hidden");
    intersect(quote, false);
    expect(screen.getByTestId("mobile-bar")).toHaveAttribute("data-state", "shown");
  });

  it("shows the price only when given one", () => {
    const { unmount } = setup();
    expect(screen.queryByText("4.200 lei")).toBeNull();
    unmount();
    setup("4.200 lei");
    expect(screen.getByText("4.200 lei")).toBeInTheDocument();
  });

  it("renders without IntersectionObserver (older browsers, jsdom)", () => {
    vi.unstubAllGlobals();
    expect(() => setup()).not.toThrow();
    expect(screen.getByTestId("mobile-bar")).toHaveAttribute("data-state", "hidden");
  });
});
