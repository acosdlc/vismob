"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/site/Button";
import { cx } from "@/components/site/cx";
import { CloseIcon } from "@/components/site/Icons";
import { SamplesForm } from "./SamplesForm";
import type { SampleBoxProps, SampleItem } from "./types";

// DESIGN §4.3 „Cutia cu mostre”: white, 1.5px ink border, the ink bar (DM Mono 11px
// uppercase .08em, like the Ticket), the empty text or the list of rows (36×36 thumbnail,
// name 14px 600, „{Familie} · {cod}” in mono at 12px, the tile's size, since §7 forbids
// muted text under 12px; DESIGN writes 11px), a 44×44 remove button, the „full” line,
// the form under a dashed rule, and the confirmation that replaces the list and the form.
// The root (MaterialsBrowser) gives the wrapper `id="cutie"`, the sticky position and the
// aria-live announcements; the counter here is live too (§7). Removing a row moves the
// focus to the next row's button (else the previous one's, else the box), so it does not
// fall to <body>.

export const BOX_TEXTS = {
  title: "Cutia cu mostre",
  empty: (limit: number) => `Apasă pe mostrele care îți plac. Poți alege până la ${limit}.`,
  full: "Cutia e plină. Scoate o mostră ca să adaugi alta.",
  sentTitle: "Gata! Pregătim cutia.",
  sentText: "Te sunăm să confirmăm adresa. Între timp, încearcă materialele pe patul tău în configurator.",
  openConfigurator: "Deschide configuratorul",
  chooseOthers: "Alege alte mostre",
  remove: (name: string) => `Scoate ${name}`,
} as const;

/** 36×36: the sample photo or the colour plus the family texture (DESIGN §2.4, §3.10). */
function Thumb({ item }: { item: SampleItem }) {
  return (
    <div
      className={cx(
        "relative size-9 shrink-0 overflow-hidden border border-[rgba(24,25,27,.25)]",
        !item.photoSrc && `tex-${item.familyId}`,
      )}
      style={item.photoSrc ? undefined : { backgroundColor: item.hex }}
      aria-hidden="true"
      data-testid="box-thumb"
    >
      {item.photoSrc && <Image src={item.photoSrc} alt="" fill sizes="36px" className="object-cover" />}
    </div>
  );
}

export function SampleBox({ items, box, settings }: SampleBoxProps) {
  const [sent, setSent] = useState(false);
  // „Alege alte mostre” remounts the form, so useActionState starts over.
  const [round, setRound] = useState(0);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const onSent = useCallback(() => setSent(true), []);

  // The confirmation replaces the form the visitor was in: move the focus to its heading (§3.16).
  useEffect(() => {
    if (sent) confirmHeadingRef.current?.focus();
  }, [sent]);

  function chooseOthers() {
    box.clear();
    setSent(false);
    setRound((r) => r + 1);
  }

  function remove(item: SampleItem) {
    const index = items.findIndex((other) => other.id === item.id);
    const next = items[index + 1] ?? items[index - 1];
    box.remove(item.id);
    requestAnimationFrame(() => {
      const target = next ? removeButtons.current.get(next.id) : asideRef.current;
      target?.focus();
    });
  }

  return (
    <aside
      ref={asideRef}
      tabIndex={-1}
      className="border-[1.5px] border-ink bg-white text-ink outline-none"
      aria-label={BOX_TEXTS.title}
      data-testid="sample-box"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink px-[14px] py-2 font-mono text-[11px] leading-[1.4] tracking-[.08em] text-paper uppercase">
        <span>{BOX_TEXTS.title}</span>
        <span aria-live="polite" aria-atomic="true" className="whitespace-nowrap" data-testid="box-count">
          {box.ids.length} / {box.limit}
        </span>
      </div>

      <div className="flex flex-col gap-[18px] p-[clamp(16px,2vw,24px)]">
        {sent ? (
          <div className="flex flex-col gap-4" data-testid="box-confirmation">
            <h2 ref={confirmHeadingRef} tabIndex={-1} className="h3-card outline-none">
              {BOX_TEXTS.sentTitle}
            </h2>
            <p className="text-[16px] leading-[1.55] text-ink-2">{BOX_TEXTS.sentText}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button href="/configurator" variant="primary">
                {BOX_TEXTS.openConfigurator}
              </Button>
              <Button variant="secondary" onClick={chooseOthers}>
                {BOX_TEXTS.chooseOthers}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {items.length === 0 ? (
              <p className="text-[16px] leading-[1.55] text-ink-2">{BOX_TEXTS.empty(box.limit)}</p>
            ) : (
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 border-b border-rule py-[6px] last:border-b-0">
                    <Thumb item={item} />
                    <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <span className="truncate text-[14px] leading-[1.3] font-semibold">{item.name}</span>
                      <span className="font-mono text-[12px] leading-[1.4] text-muted">
                        {item.familyName} · {item.code}
                      </span>
                    </div>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) removeButtons.current.set(item.id, el);
                        else removeButtons.current.delete(item.id);
                      }}
                      onClick={() => remove(item)}
                      aria-label={BOX_TEXTS.remove(item.name)}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-ui text-ink transition-[background-color] duration-150 hover:bg-paper-2"
                    >
                      <CloseIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {box.isFull && <p className="mono-12 text-ink-2">{BOX_TEXTS.full}</p>}
            <SamplesForm key={round} items={items} box={box} settings={settings} onSent={onSent} />
          </>
        )}
      </div>
    </aside>
  );
}
