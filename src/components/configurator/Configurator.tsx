"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { DrawingFigure } from "@/components/drawings/DrawingFigure";
import { trackEvent } from "@/lib/analytics";
import { configCode } from "@/lib/configurator/format";
import { resolve } from "@/lib/configurator/rules";
import type { Config, FamilyId } from "@/lib/configurator/types";
import { configFromParams, paramsFromConfig } from "@/lib/configurator/url";
import { BODY_CLASSES, LEFT_CLASSES, RIGHT_CLASSES, STEPS, StepFieldset } from "./ConfiguratorSkeleton";
import { MobileBar } from "./MobileBar";
import { QuoteSection } from "./QuoteSection";
import { TicketPanel, priceLabel } from "./TicketPanel";
import { StepBase } from "./steps/StepBase";
import { StepExtras } from "./steps/StepExtras";
import { StepHeadboard } from "./steps/StepHeadboard";
import { StepMaterial } from "./steps/StepMaterial";
import { StepModel } from "./steps/StepModel";
import { StepSize } from "./steps/StepSize";
import type { ConfiguratorProps } from "./types";

// DESIGN §4.2, §5.2, §5.3, §5.8: the client root. The configuration is state derived from
// the URL on mount (useSearchParams → configFromParams) and resolved on every render; every
// change is written back with history.replaceState (no new history entries; Next syncs
// useSearchParams with it). Components only display what resolve() returns.

/** The step a change comes from, reported as `config_step { step }` (ARHITECTURA §10). */
type ConfigStep = "model" | "size" | "material" | "headboard" | "base" | "extras";

export function Configurator({ catalog, settings, pricing }: ConfiguratorProps) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [config, setConfig] = useState<Config>(() => configFromParams(new URLSearchParams(query)));
  // When the URL changes under the component (a link to /configurator?m=…), the state
  // follows the URL. Next reports our own replaceState back through useSearchParams a
  // render later, so the query we wrote is remembered and skipped.
  const [seenQuery, setSeenQuery] = useState(query);
  const [writtenQuery, setWrittenQuery] = useState<string | null>(null);
  if (query !== seenQuery) {
    setSeenQuery(query);
    if (query !== writtenQuery) setConfig(configFromParams(new URLSearchParams(query)));
  }

  const resolved = resolve(config, catalog);
  const code = configCode(resolved);
  const price = priceLabel(resolved, settings, pricing);

  const figureRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  // ARHITECTURA §10: config_start once per mount, on the visitor's first change (a configuration
  // that only arrived in the URL does not count), then config_step with the step of every change.
  const started = useRef(false);

  function update(patch: Partial<Config>, step: ConfigStep) {
    const next = resolve({ ...config, ...patch }, catalog).cfg;
    const nextQuery = paramsFromConfig(next).toString();
    setConfig(next);
    setWrittenQuery(nextQuery);
    window.history.replaceState(null, "", `?${nextQuery}`);
    if (!started.current) {
      started.current = true;
      trackEvent("config_start");
    }
    trackEvent("config_step", { step });
  }

  /** §5.2: a new family takes its first colour (resolve picks it when the id is unknown). */
  function changeFamily(family: FamilyId) {
    update({ family, color: "" }, "material");
  }

  return (
    <>
      <div className={BODY_CLASSES} data-testid="configurator">
        <div className={LEFT_CLASSES}>
          <div ref={figureRef} className="order-1 w-full nav:order-none">
            <DrawingFigure resolved={resolved} idPrefix="configurator" />
          </div>
          <div className="order-3 w-full nav:order-none">
            <TicketPanel resolved={resolved} settings={settings} pricing={pricing} />
          </div>
        </div>

        <div className={RIGHT_CLASSES}>
          <StepFieldset {...STEPS[0]}>
            <StepModel models={catalog.models} value={resolved.model.id} onChange={(model) => update({ model }, "model")} />
          </StepFieldset>
          <StepFieldset {...STEPS[1]}>
            <StepSize config={resolved.cfg} onChange={(patch) => update(patch, "size")} />
          </StepFieldset>
          <StepFieldset {...STEPS[2]}>
            <StepMaterial
              model={resolved.model}
              families={catalog.families}
              resolved={resolved}
              onFamilyChange={changeFamily}
              onColorChange={(color) => update({ color }, "material")}
            />
          </StepFieldset>
          <StepFieldset {...STEPS[3]}>
            <StepHeadboard value={resolved.cfg.hb} onChange={(hb) => update({ hb }, "headboard")} />
          </StepFieldset>
          <StepFieldset {...STEPS[4]}>
            <StepBase bases={catalog.bases} value={resolved.base.id} onChange={(base) => update({ base }, "base")} />
          </StepFieldset>
          <StepFieldset {...STEPS[5]}>
            <StepExtras value={resolved.cfg} onChange={(patch) => update(patch, "extras")} />
          </StepFieldset>
        </div>
      </div>

      <div ref={quoteRef}>
        <QuoteSection config={resolved.cfg} code={code} responseTime={settings.response_time} />
      </div>

      <MobileBar resolved={resolved} price={price} figureRef={figureRef} quoteRef={quoteRef} />
    </>
  );
}
