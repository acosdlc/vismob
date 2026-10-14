import Image from "next/image";
import { cx } from "./cx";

export type SwatchFamily = "catifea" | "boucle" | "stofa" | "piele" | "lemn";

export interface SwatchProps {
  name: string;
  /** Fallback colour while the sample photo is missing. */
  hex: string;
  family: SwatchFamily;
  /** Display name of the family, e.g. „Catifea”. */
  familyName: string;
  /** Supplier code, e.g. „CT01”. */
  code?: string;
  photoSrc?: string;
  /** What goes under the name: the family (default) or the code. */
  sub?: "family" | "code";
  /** `sizes` for the sample photo. */
  sizes?: string;
  className?: string;
}

// DESIGN §3.10, grid variant (Acasă, Materiale): 1:1 square with a 1px rgba(24,25,27,.25)
// border, the photo or the colour plus the family texture (§2.4), then the name (14px 600)
// and the family or code (DM Mono 11px muted). The configurator button variant is separate.
export function Swatch({
  name,
  hex,
  family,
  familyName,
  code,
  photoSrc,
  sub = "family",
  sizes = "(min-width: 60rem) 150px, 33vw",
  className,
}: SwatchProps) {
  const subText = sub === "code" && code ? code : familyName;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div
        className={cx(
          "relative aspect-square overflow-hidden border border-[rgba(24,25,27,.25)]",
          !photoSrc && `tex-${family}`,
        )}
        style={photoSrc ? undefined : { backgroundColor: hex }}
      >
        {photoSrc && <Image src={photoSrc} alt="" fill sizes={sizes} className="object-cover" />}
      </div>
      <div className="flex flex-col gap-[2px]">
        <span className="text-[14px] leading-[1.3] font-semibold">{name}</span>
        <span className="font-mono text-[12px] leading-[1.4] text-muted">{subText}</span>
      </div>
    </div>
  );
}
