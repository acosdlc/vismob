import Image from "next/image";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { PhotoPlaceholder, RATIO_CLASS, type PhotoRatio } from "./PhotoPlaceholder";

export interface PhotoProps {
  /** Without a src the FOTO placeholder is shown. */
  src?: string;
  alt: string;
  ratio: PhotoRatio;
  /** `sizes` for next/image (the image uses `fill`). */
  sizes?: string;
  /** Preload the image (the hero / LCP photo). */
  priority?: boolean;
  /** Placeholder label, e.g. „FOTO 01”. */
  label?: string;
  /** Placeholder frame description. */
  frame?: string;
  /** Caption under the photo, DM Mono 12px ink-2: „[Model] · [160 × 200] · [material, culoare] · [oraș]”. */
  caption?: string;
  className?: string;
  /** Overlays inside the photo box (e.g. the hero ticket), positioned absolutely by the caller. */
  children?: ReactNode;
}

// DESIGN §3.4. `priority` maps to next/image's `preload` (Next 16 deprecated `priority`).
export function Photo({
  src,
  alt,
  ratio,
  sizes = "100vw",
  priority = false,
  label,
  frame,
  caption,
  className,
  children,
}: PhotoProps) {
  const box = src ? (
    <div className={cx("relative overflow-hidden", RATIO_CLASS[ratio])}>
      <Image src={src} alt={alt} fill sizes={sizes} preload={priority} className="object-cover" />
      {children}
    </div>
  ) : (
    <PhotoPlaceholder ratio={ratio} label={label} frame={frame}>
      {children}
    </PhotoPlaceholder>
  );

  if (!caption) {
    return <div className={className}>{box}</div>;
  }
  return (
    <figure className={cx("flex flex-col gap-[10px]", className)}>
      {box}
      <figcaption className="mono-12 text-ink-2">{caption}</figcaption>
    </figure>
  );
}
