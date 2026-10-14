import type { ReactNode } from "react";
import { cx } from "@/components/site/cx";

// A numbered home section (DESIGN §4.1): sections 02, 03, 06, 07, 08 and 09 have a
// top rule; 07 sits on paper-2.
export function Section({
  id,
  rule = false,
  tone = "paper",
  className,
  children,
}: {
  id?: string;
  rule?: boolean;
  tone?: "paper" | "paper-2";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cx("section", rule && "border-t border-rule", tone === "paper-2" && "bg-paper-2", className)}
    >
      <div className="container-site">{children}</div>
    </section>
  );
}
