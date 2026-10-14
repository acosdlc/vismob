import { QuoteForm } from "./QuoteForm";
import type { QuoteSectionProps } from "./types";

// DESIGN §4.2 „07 — Trimite configurația”: paper-2, a rule on top, padding clamp(56px,7vw,96px);
// two columns that wrap, the text (flex 1 1 320px) and the form (flex 2 1 520px). Hook-free:
// only the form is a Client Component.

/** The three steps after a request (the same texts as the confirmation email). */
export function quoteSteps(responseTime: string): string[] {
  return [
    `Te sunăm în ${responseTime} să clarificăm detaliile.`,
    "Venim la măsurători sau confirmăm dimensiunile cu tine.",
    "Primești desenul final și prețul, în scris.",
  ];
}

export function QuoteSection({ config, code, responseTime }: QuoteSectionProps) {
  return (
    <section id="cerere" className="border-t border-rule bg-paper-2 py-[clamp(56px,7vw,96px)]" aria-labelledby="cerere-titlu">
      <div className="container-site flex flex-wrap items-start gap-[clamp(28px,4vw,56px)]">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <h2 id="cerere-titlu" className="h2-request">
            Primești oferta finală după o discuție scurtă.
          </h2>
          <ol role="list" className="border-t border-rule">
            {quoteSteps(responseTime).map((step, i) => (
              <li key={step} className="flex items-baseline gap-4 border-b border-rule py-3 text-[16px] leading-[1.55]">
                <span className="mono-13 shrink-0 text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="min-w-0 flex-[2_1_520px]">
          <QuoteForm config={config} code={code} responseTime={responseTime} />
        </div>
      </div>
    </section>
  );
}
