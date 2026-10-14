import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface Crumb {
  label: string;
  href: string;
}

export interface PageHeaderProps {
  title: string;
  /** Paragraph under the H1 (`.lead`). */
  lead?: ReactNode;
  /** Pages before the current one. Default: Acasă → `/`. */
  crumbs?: Crumb[];
  /** Label of the current page in the breadcrumb. Default: `title`. */
  current?: string;
  /** Mono note on the right, e.g. „6 pași · aproximativ 2 minute” (DESIGN §4.2). */
  aside?: ReactNode;
  className?: string;
}

const HOME: Crumb[] = [{ label: "Acasă", href: "/" }];

// DESIGN §4.2–§4.4: breadcrumb „Acasă / Lucrări” (mono), H1 `.h1-page`, paragraph;
// padding `clamp(32px,4vw,56px) 0 clamp(24px,3vw,40px)`. The page supplies the container.
export function PageHeader({ title, lead, crumbs = HOME, current = title, aside, className }: PageHeaderProps) {
  return (
    <div className={cx("flex flex-col gap-4 pt-[clamp(32px,4vw,56px)] pb-[clamp(24px,3vw,40px)]", className)}>
      <nav aria-label="Breadcrumb" className="mono-13 text-muted">
        <ol className="flex flex-wrap items-center">
          {crumbs.map((crumb) => (
            <li key={crumb.href} className="flex items-center">
              <Link href={crumb.href} className="inline-flex min-h-11 items-center hover:underline">
                {crumb.label}
              </Link>
              <span aria-hidden="true" className="px-2">
                /
              </span>
            </li>
          ))}
          <li aria-current="page" className="flex min-h-11 items-center text-ink">
            {current}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex max-w-[760px] flex-col gap-4">
          <h1 className="h1-page">{title}</h1>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {aside && <p className="mono-13 text-muted">{aside}</p>}
      </div>
    </div>
  );
}
