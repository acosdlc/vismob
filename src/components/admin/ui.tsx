import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/components/site/cx";
import type { LeadStatus } from "@/lib/admin/types";
import { LEAD_STATUS_LABELS } from "@/lib/admin/types";

// The admin panel's building blocks (docs/DESIGN.md §4.7). Nothing new is
// invented: the tokens, the type roles (h2-request, h3-card, eyebrow, mono-12,
// mono-13) and the 1.5px ink card come from the site. Server-compatible: no
// hooks. Forms reuse src/components/site/form; buttons src/components/site/Button.

export interface AdminPageProps {
  title: string;
  /** Paragraph under the title (`text-ink-2`). */
  lead?: ReactNode;
  /** Right side of the title row: buttons or a mono note. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** One admin screen: title row, then the content stacked with a 32px gap. */
export function AdminPage({ title, lead, actions, children, className }: AdminPageProps) {
  return (
    <div className={cx("flex flex-col gap-8", className)}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex max-w-[760px] flex-col gap-3">
          <h1 className="h2-request">{title}</h1>
          {lead && <p className="text-[16px] text-ink-2">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export interface AdminSectionProps extends Omit<ComponentProps<"section">, "title"> {
  title: string;
  description?: ReactNode;
  /** Right side of the heading row. */
  aside?: ReactNode;
}

/** A titled block: `h2.h3-card`, optional description, then the content (gap 18px). */
export function AdminSection({ title, description, aside, className, children, ...props }: AdminSectionProps) {
  return (
    <section className={cx("flex flex-col gap-[18px]", className)} {...props}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 className="h3-card">{title}</h2>
          {description && <p className="text-[15px] text-ink-2">{description}</p>}
        </div>
        {aside && <div className="mono-13 text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** The site's card (DESIGN §3.16 FormCard without the bar): white, 1.5px ink border. */
export function AdminCard({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("border-[1.5px] border-ink bg-white p-[clamp(20px,3vw,36px)] text-ink", className)} {...props} />;
}

export type NoticeTone = "ok" | "error" | "info";

export interface NoticeProps extends Omit<ComponentProps<"p">, "role"> {
  tone: NoticeTone;
}

const NOTICE: Record<NoticeTone, string> = {
  ok: "border-accent text-accent",
  error: "border-error text-error",
  info: "border-rule text-ink-2",
};

/**
 * A one-line message under a form or at the top of a screen. Errors are announced
 * (`role="alert"`), the rest is polite (`role="status"`). Renders nothing when empty.
 */
export function Notice({ tone, className, children, ...props }: NoticeProps) {
  if (!children) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-ui border bg-white px-[14px] py-3 text-[15px] leading-[1.4]", NOTICE[tone], className)}
      {...props}
    >
      {children}
    </p>
  );
}

const STATUS_TONE: Record<LeadStatus, string> = {
  nou: "border-accent text-accent",
  contactat: "border-ink text-ink",
  ofertat: "border-ink text-ink",
  castigat: "border-accent bg-accent text-white",
  pierdut: "border-rule text-muted",
  spam: "border-rule text-muted",
};

/** The lead status as a mono tag (eyebrow letterforms, 1px border). */
export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-ui border px-2 py-[2px] font-mono text-[12px] leading-[1.5] tracking-[.08em] uppercase whitespace-nowrap",
        STATUS_TONE[status],
        className,
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}

/** Horizontal scroll for tables on narrow screens; the table keeps its natural width. */
export function TableWrap({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)} {...props} />;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cx("w-full border-collapse text-left text-[15px] leading-[1.4]", className)} {...props} />;
}

/** Column header: the eyebrow role (mono 12px uppercase, muted) over a 1px rule. */
export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cx("eyebrow border-b border-rule py-3 pr-4 font-normal", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cx("border-b border-rule py-3 pr-4 align-top", className)} {...props} />;
}

/** Shown in place of a table or a list with nothing in it. */
export function EmptyState({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p className={cx("border border-rule bg-card px-[14px] py-6 text-center text-[15px] text-ink-2", className)} {...props}>
      {children}
    </p>
  );
}

/** Filters and search above a list: wraps, 12px gap, controls aligned at the bottom. */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("flex flex-wrap items-end gap-3", className)} {...props} />;
}

/** Fields side by side (DESIGN §3.16): `minmax(min(220px, 100%), 1fr)`, 18px gap. */
export const fieldGridClasses = "grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]";

/** Mono key/value rows (DESIGN §3.6 ticket letterforms) for metadata: date, source, id. */
export function MetaList({ rows, className }: { rows: { k: string; v: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-[7px] font-mono text-[13px] leading-[1.5]", className)}>
      {rows.map((row) => (
        <Row key={row.k} k={row.k} v={row.v} />
      ))}
    </dl>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}
