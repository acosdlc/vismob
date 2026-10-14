import { Fragment, type ReactNode } from "react";
import { cx } from "./cx";

export interface TicketRow {
  k: string;
  v: string;
}

export interface TicketProps {
  /** Title bar text, e.g. „FIȘĂ PROIECT” or „Fișă de configurare” (rendered uppercase). */
  title: string;
  /** Right side of the title bar, e.g. „Nr. 0123” or the configuration code (which may carry aria-live, DESIGN §7). */
  number?: ReactNode;
  rows: TicketRow[];
  /** `sm`: 12px rows, gap 5px 16px (hero). `md`: 13px rows, gap 7px 18px (configurator). */
  size?: "sm" | "md";
  /** Extra blocks under the rows (price block, buttons). */
  children?: ReactNode;
  className?: string;
}

const ROWS: Record<NonNullable<TicketProps["size"]>, string> = {
  sm: "gap-x-4 gap-y-[5px] text-[12px]",
  md: "gap-x-[18px] gap-y-[7px] text-[13px]",
};

// DESIGN §3.6: border 1.5px ink, white, ink title bar in DM Mono 11px uppercase .08em
// (padding 8px 14px), `<dl>` grid auto 1fr with muted `<dt>`.
export function Ticket({ title, number, rows, size = "sm", children, className }: TicketProps) {
  return (
    <div className={cx("border-[1.5px] border-ink bg-white text-ink", className)}>
      <div className="flex items-baseline justify-between gap-4 bg-ink px-[14px] py-2 font-mono text-[11px] leading-[1.4] tracking-[.08em] text-paper uppercase">
        <span>{title}</span>
        {number && <span className="text-right">{number}</span>}
      </div>
      <div className="flex flex-col gap-3 p-[14px]">
        <dl className={cx("grid grid-cols-[auto_1fr] font-mono leading-[1.5]", ROWS[size])}>
          {rows.map((row) => (
            <Fragment key={row.k}>
              <dt className="text-muted">{row.k}</dt>
              <dd>{row.v}</dd>
            </Fragment>
          ))}
        </dl>
        {children}
      </div>
    </div>
  );
}
