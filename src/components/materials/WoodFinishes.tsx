// DESIGN §4.3, the Lemn tab's extra block „Finisaje pentru lemn”: three cards (1px rule
// border, card background, the model cards' padding from §3.9). The only placeholder,
// [o dată pe an], comes from settings.oil_refresh_interval.

export interface WoodFinishesProps {
  /** settings.oil_refresh_interval, e.g. „[o dată pe an]”. */
  oilRefreshInterval: string;
}

export function woodFinishes(oilRefreshInterval: string): { title: string; text: string }[] {
  return [
    { title: "Ulei natural", text: `Mat, se simte lemnul la atingere. Se reîmprospătează ${oilRefreshInterval}.` },
    { title: "Lac mat", text: "Protecție mai bună la pete și zgârieturi." },
    { title: "Baiț + ulei", text: "Pentru nuanțe închise pe stejar sau frasin." },
  ];
}

export function WoodFinishes({ oilRefreshInterval }: WoodFinishesProps) {
  return (
    <section aria-labelledby="finisaje-lemn" className="flex flex-col gap-6 py-8">
      <h2 id="finisaje-lemn" className="h2-family">
        Finisaje pentru lemn
      </h2>
      <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-[clamp(12px,2vw,24px)] p-0">
        {woodFinishes(oilRefreshInterval).map((card) => (
          <li key={card.title} className="flex flex-col gap-2 border border-rule bg-card p-[clamp(14px,1.8vw,22px)]">
            <h3 className="text-[19px] leading-[1.25] font-semibold">{card.title}</h3>
            <p className="text-[15px] text-ink-2">{card.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
