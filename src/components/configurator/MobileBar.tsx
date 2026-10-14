"use client";

import { useEffect, useState, type RefObject } from "react";
import { BedDrawing } from "@/components/drawings/BedDrawing";
import { configCode } from "@/lib/configurator/format";
import type { Resolved } from "@/lib/configurator/rules";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";

// DESIGN §5.8: under 960px, a bar fixed at the bottom that appears once the drawing has
// left the viewport, with the 48px thumbnail, the code, the price (when shown) and
// „Cere ofertă” → #cerere. It hides again while the quote section is in view, so it never
// covers that form's submit button. padding-bottom: env(safe-area-inset-bottom).

/** Whether `ref`'s element is intersecting the viewport; `initial` until the observer reports. */
function useInView(ref: RefObject<HTMLElement | null>, initial: boolean): boolean {
  const [inView, setInView] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setInView(entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

export interface MobileBarProps {
  resolved: Resolved;
  /** The formatted price, or null when prices are hidden. */
  price: string | null;
  /** The drawing's wrapper: the bar shows once it has scrolled out of view. */
  figureRef: RefObject<HTMLElement | null>;
  /** The quote section's wrapper: the bar hides while it is in view. */
  quoteRef: RefObject<HTMLElement | null>;
}

export function MobileBar({ resolved, price, figureRef, quoteRef }: MobileBarProps) {
  const figureInView = useInView(figureRef, true);
  const quoteInView = useInView(quoteRef, false);
  const shown = !figureInView && !quoteInView;
  const code = configCode(resolved);

  // The slide transition is cancelled globally under prefers-reduced-motion (globals.css).
  return (
    <div
      className={cx(
        "fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper px-[clamp(16px,4vw,48px)] pt-[10px] pb-[calc(10px+env(safe-area-inset-bottom))] transition-transform duration-200 nav:hidden",
        shown ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
      data-testid="mobile-bar"
      data-state={shown ? "shown" : "hidden"}
      aria-hidden={!shown}
      inert={!shown}
    >
      <div className="flex items-center gap-3">
        <div className="drafting size-12 shrink-0 overflow-hidden border border-rule">
          <BedDrawing resolved={resolved} idPrefix="mobile-bar" className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px] font-mono leading-[1.4]">
          <span className="truncate text-[12px]" data-testid="mobile-bar-code">
            {code}
          </span>
          {price !== null && <span className="text-[13px] font-medium">{price}</span>}
        </div>
        <Button href="#cerere" size="header" className="shrink-0" tabIndex={shown ? undefined : -1}>
          Cere ofertă
        </Button>
      </div>
    </div>
  );
}
