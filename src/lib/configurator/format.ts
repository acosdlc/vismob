// Code, caption, ticket rows, WhatsApp message (docs/DESIGN.md §5.6, §5.7).
import type { Resolved } from "./rules";

export function configCode(r: Resolved): string {
  const { led, nightstands, hb } = r.cfg;
  return (
    `${r.model.code}-${r.w}x${r.l}-${r.color.code}-H${hb}-${r.base.code}` +
    (led ? "-LED" : "") +
    (nightstands ? "-N2" : "")
  );
} // e.g. CAP-160x200-CT01-H120-LD-LED

export function sizeLabel(r: Resolved) {
  return `${r.w} × ${r.l} cm`;
}

export function caption(r: Resolved): string {
  return (
    `${r.model.name} · ${r.family.name.toLowerCase()}, ${r.color.name.toLowerCase()} · ` +
    `${sizeLabel(r)} · tăblie ${r.cfg.hb} cm · ${r.base.name.toLowerCase()}`
  );
}

export function ticketRows(r: Resolved): { k: string; v: string }[] {
  const extras = [r.cfg.led && "LED sub pat", r.cfg.nightstands && "2 noptiere"].filter(Boolean) as string[];
  return [
    { k: "Model", v: r.model.name },
    { k: "Saltea", v: sizeLabel(r) },
    { k: "Material", v: `${r.family.name}, ${r.color.name.toLowerCase()}` },
    { k: "Tăblie", v: `${r.cfg.hb} cm de la podea` },
    { k: "Bază", v: r.base.name },
    { k: "Extra", v: extras.length ? extras.join(", ") : "—" },
  ];
}

export function whatsappText(r: Resolved, shareUrl: string): string {
  const rows = ticketRows(r)
    .map((x) => `${x.k}: ${x.v}`)
    .join("; ");
  return `Bună ziua! Aș vrea o ofertă pentru patul configurat pe site (${configCode(r)}): ${rows}. ${shareUrl}`;
}

/** „Preț orientativ: {X} lei”: rounded upstream (estimatePrice), formatted for ro-RO. */
export function formatPrice(lei: number): string {
  return `${new Intl.NumberFormat("ro-RO").format(lei)} lei`;
}

/**
 * WhatsApp link (DESIGN §5.6): https://wa.me/<international number, digits only>?text=…
 * The number may contain spaces, "+", dashes or dots; only its digits are kept.
 * Returns null when fewer than 8 digits remain, so the caller hides the button.
 */
export function whatsappUrl(number: string, text: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
