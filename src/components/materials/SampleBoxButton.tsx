"use client";

import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";

// DESIGN §6, the Materiale row: under 960px the box sits under the content and a fixed
// button „Cutia ({n})” leads to it. DESIGN gives no visibility rule, so: shown only while
// the box holds something and is out of view (IntersectionObserver, like the configurator's
// MobileBar), bottom-right, secondary style on a white surface, above the safe area.

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

export interface SampleBoxButtonProps {
  /** Samples in the box; the button is hidden at 0. */
  count: number;
  /** The box's wrapper (`#cutie`): the button shows once it has scrolled out of view. */
  targetRef: RefObject<HTMLElement | null>;
}

export function SampleBoxButton({ count, targetRef }: SampleBoxButtonProps) {
  // Until the observer reports, the box counts as visible, so the button never flashes on load.
  const boxInView = useInView(targetRef, true);
  const shown = count > 0 && !boxInView;

  // The slide transition is cancelled globally under prefers-reduced-motion (globals.css).
  return (
    <div
      className={cx(
        "fixed right-[clamp(16px,4vw,48px)] bottom-[calc(16px+env(safe-area-inset-bottom))] z-30 transition-transform duration-200 nav:hidden",
        shown ? "translate-y-0" : "pointer-events-none translate-y-[calc(100%+32px)]",
      )}
      data-testid="sample-box-button"
      data-state={shown ? "shown" : "hidden"}
      aria-hidden={!shown}
      inert={!shown}
    >
      <Button href="#cutie" variant="secondary" size="header" className="bg-white" tabIndex={shown ? undefined : -1}>
        Cutia ({count})
      </Button>
    </div>
  );
}
