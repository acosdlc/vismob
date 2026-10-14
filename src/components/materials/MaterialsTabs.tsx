"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/site/cx";

// DESIGN §4.3 tabs: bar with a 1px ink border below, 17px text, min-height 48px, the active
// one 600 with a 3px accent underline (inset box-shadow, so the bar's border stays), each with
// a mono counter („Textile 4 familii”). WAI-ARIA tabs with automatic activation: the active
// tab is the only one in the tab order; Left/Right/Home/End move the focus and select.

export type MaterialsTabId = "textile" | "lemn" | "baze";

export interface MaterialsTab {
  id: MaterialsTabId;
  label: string;
  /** The mono counter, e.g. „4 familii”. */
  count: string;
}

export interface MaterialsTabsProps {
  tabs: MaterialsTab[];
  active: MaterialsTabId;
  onChange: (id: MaterialsTabId) => void;
  /** The content of the active panel. */
  children: ReactNode;
  className?: string;
}

const tabId = (id: MaterialsTabId) => `tab-${id}`;
const panelId = (id: MaterialsTabId) => `panel-${id}`;

export function MaterialsTabs({ tabs, active, onChange, children, className }: MaterialsTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === active);
    if (index < 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    onChange(target.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${tabId(target.id)}`)?.focus();
  }

  return (
    <div className={cx("flex flex-col", className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Categorii de materiale"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-x-7 border-b border-ink"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cx(
                "flex min-h-12 items-center text-[17px] leading-[1.3] transition-[box-shadow,color] duration-150",
                selected ? "font-semibold shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-ink-2 hover:text-ink",
              )}
            >
              <span className="inline-flex items-baseline gap-2">
                {tab.label}
                <span className="mono-12 text-muted">{tab.count}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId(active)} aria-labelledby={tabId(active)} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
