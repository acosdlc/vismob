import type { SVGProps } from "react";

// DESIGN §2.5: inline outline icons (stroke currentColor, width 1.6, fill none), no icon
// library, no emoji. Decorative: aria-hidden. Sized by className; the width/height
// attributes only give the natural size when no class sets one.
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">;

export function ArrowIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 10"
      width={16}
      height={10}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M0 5h15M11 1l4 4-4 4" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 18 12"
      width={18}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M0 1h18M0 6h18M0 11h18" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M1 1l10 10M11 1L1 11" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 12 10"
      width={12}
      height={10}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M1 5l3.5 3.5L11 1" />
    </svg>
  );
}
