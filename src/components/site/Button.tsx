import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { ArrowIcon } from "./Icons";
import { isExternalHref } from "./links";

// DESIGN §3.2 (variants and sizes), §2.6 (hover, transition, focus), §3.1 (header size).
export type ButtonVariant = "primary" | "secondary" | "inverse" | "link";
export type ButtonSize = "default" | "header";

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Appends the arrow icon at 10px (the large CTAs). */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
}

type AnchorProps = BaseProps & { href: string } & Omit<ComponentProps<"a">, keyof BaseProps | "href">;
type NativeButtonProps = BaseProps & Omit<ComponentProps<"button">, keyof BaseProps>;

/** With `href` it renders a link (next/link, or a plain anchor for external, tel:, mailto: and wa.me hrefs); without one a `<button type="button">`. */
export type ButtonProps = AnchorProps | NativeButtonProps;

const VARIANT: Record<Exclude<ButtonVariant, "link">, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border-[1.5px] border-ink text-ink hover:bg-ink hover:text-white",
  inverse: "bg-white text-ink",
};

const SIZE: Record<ButtonSize, string> = {
  default: "min-h-[52px] px-[26px] text-[16px]",
  header: "min-h-[46px] px-6 text-[15px]",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "default",
  className?: string,
): string {
  return cx(
    "inline-flex items-center justify-center gap-[10px] text-center font-semibold leading-[1.2] transition-[background-color,color] duration-150",
    variant === "link"
      ? "min-h-11 text-[15px] text-accent underline"
      : cx("rounded-ui", SIZE[size], VARIANT[variant]),
    className,
  );
}

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "default", arrow = false, className, children, ...rest } = props;
  const classes = buttonClasses(variant, size, className);
  const content = (
    <>
      {children}
      {arrow && <ArrowIcon className="h-[10px] w-4 shrink-0" />}
    </>
  );

  if ("href" in rest) {
    const { href, ...anchor } = rest;
    if (isExternalHref(href)) {
      return (
        <a href={href} className={classes} {...anchor}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...anchor}>
        {content}
      </Link>
    );
  }

  const { type = "button", ...button } = rest;
  return (
    <button type={type} className={classes} {...button}>
      {content}
    </button>
  );
}
