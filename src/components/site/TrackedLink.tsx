"use client";

import type { MouseEvent } from "react";
import { trackEvent, type EventProperties } from "@/lib/analytics";
import { Button, type ButtonProps } from "./Button";

// ARHITECTURA §10: the WhatsApp and phone buttons rendered by Server Components (ContactSection)
// need an onClick to report whatsapp_click / phone_click. This is the one client component
// outside CLAUDE.md rule 3 (docs/PLAN.md, decisions). It renders the same Button with the same
// href, classes, target and rel; the event is reported and the navigation goes on.

type ButtonLinkProps = Extract<ButtonProps, { href: string }>;

export type TrackedLinkProps = ButtonLinkProps & {
  event: "whatsapp_click" | "phone_click";
  properties?: EventProperties;
};

export function TrackedLink({ event, properties, onClick, ...button }: TrackedLinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    trackEvent(event, properties);
    onClick?.(e);
  }
  return <Button {...button} onClick={handleClick} />;
}
