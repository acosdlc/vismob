"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { FORM_FIELDS } from "@/lib/leads/types";

// Cloudflare Turnstile (ARHITECTURA §6.1 step 3.2, §9). The widget renders only when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set at build time; without it the component renders
// nothing and the server skips the check (verifyTurnstile without TURNSTILE_SECRET_KEY).

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
      remove?: (widgetId: string) => void;
    };
  }
}

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  // The script may already be on the page (another form, a client navigation back). `ready`
  // only drives the effect below, so the server/client difference changes no markup.
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));
  const [token, setToken] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    const turnstile = window.turnstile;
    if (!ready || !siteKey || !container || !turnstile) return;
    const widgetId = turnstile.render(container, {
      sitekey: siteKey,
      callback: (value) => setToken(value),
      "error-callback": () => setToken(""),
      "expired-callback": () => setToken(""),
    });
    return () => {
      if (widgetId) turnstile.remove?.(widgetId);
    };
  }, [ready, siteKey]);

  if (!siteKey) return null;

  return (
    <>
      <Script src={TURNSTILE_SCRIPT_URL} strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={containerRef} />
      <input type="hidden" name={FORM_FIELDS.turnstile} value={token} />
    </>
  );
}
