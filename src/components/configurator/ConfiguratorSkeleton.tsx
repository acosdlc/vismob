import type { ReactNode } from "react";
import { cx } from "@/components/site/cx";

// DESIGN §4.2: the two-column body, shared by the live configurator and by the Suspense
// fallback the page renders in the static HTML. Hook-free, so it stays a Server Component.

/** The six steps of §4.2, in order. */
export const STEPS = [
  { n: "01", title: "Model" },
  { n: "02", title: "Dimensiunea saltelei" },
  { n: "03", title: "Material și culoare" },
  { n: "04", title: "Înălțimea tăbliei" },
  { n: "05", title: "Baza patului" },
  { n: "06", title: "Extra" },
] as const;

/** Outer flex of the body: two columns that wrap, gap clamp(28px,4vw,56px), align flex-start. */
export const BODY_CLASSES = "container-site flex flex-wrap items-start gap-[clamp(28px,4vw,56px)] pb-[clamp(32px,4vw,56px)]";

/**
 * Left column (flex 1.4 1 600px, sticky top 16px, gap 20px) from 960px up. Below, it is
 * `display: contents`, so the figure and the ticket become siblings of the steps and the
 * `order` utilities move the ticket after step 06 (§5.8) without rendering it twice.
 */
export const LEFT_CLASSES =
  "contents nav:sticky nav:top-4 nav:flex nav:min-w-0 nav:shrink nav:grow-[1.4] nav:basis-[600px] nav:flex-col nav:gap-5";

/** Right column: flex 1 1 400px. */
export const RIGHT_CLASSES = "order-2 flex min-w-0 shrink grow basis-[400px] flex-col nav:order-none";

/** The top bar of the drawing frame (§4.2 item 1): DM Mono 11px uppercase, rule below, 10px 14px. */
export const FIGURE_BAR_CLASSES =
  "flex items-baseline justify-between gap-4 border-b border-rule px-[14px] py-[10px] font-mono text-[11px] leading-[1.4] tracking-[.08em] uppercase";

export interface StepFieldsetProps {
  n: string;
  title: string;
  children?: ReactNode;
  className?: string;
}

/**
 * One step (§4.2): `<fieldset>` with padding 28px 0 and a rule below; the `<legend>` is the
 * number in DM Mono 13px accent and the title at 19px 600, 12px apart. The legend floats so
 * it sits inside the padding like normal flow (a legend otherwise straddles the top border).
 */
export function StepFieldset({ n, title, children, className }: StepFieldsetProps) {
  return (
    <fieldset className={cx("min-w-0 border-b border-rule py-7", className)}>
      <legend className="float-left mb-[18px] flex w-full items-baseline gap-3">
        <span className="font-mono text-[13px] leading-[1.5] text-accent">{n}</span>
        <span className="text-[19px] leading-[1.25] font-semibold">{title}</span>
      </legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

/** The empty drawing frame: white, border 1.5px ink, the bar, drafting paper at 320/180. */
export function FigureFrame({ code, children }: { code?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-[1.5px] border-ink bg-white">
      <div className={FIGURE_BAR_CLASSES}>
        <span>Desen la scară · vedere din față</span>
        {code && <span className="text-right">{code}</span>}
      </div>
      <div className="drafting aspect-[320/180] w-full">{children}</div>
    </div>
  );
}

/**
 * Suspense fallback of the configurator page: the page's shape (figure frame, six step
 * legends) with no controls, so the static HTML is not empty while the client root waits
 * for the URL (useSearchParams).
 */
export function ConfiguratorSkeleton() {
  return (
    <div className={BODY_CLASSES} aria-busy="true" data-testid="configurator-skeleton">
      <div className={LEFT_CLASSES}>
        <div className="order-1 w-full nav:order-none">
          <FigureFrame />
        </div>
      </div>
      <div className={RIGHT_CLASSES}>
        {STEPS.map((step) => (
          <StepFieldset key={step.n} n={step.n} title={step.title} />
        ))}
      </div>
    </div>
  );
}
