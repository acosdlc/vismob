"use client"; // Next.js requires it of error files; the owner accepted this exception to CLAUDE.md rule 3.

import type { CSSProperties } from "react";

// The last fallback, in place of the framework's English „This page couldn’t load”: what
// the visitor or the admin sees when an error reaches the root of the app. The screens
// under /admin/(panel) have their own (error.tsx there, which keeps the admin header);
// everything else, the public pages and /admin/login included, ends here.
//
// It replaces the root layout while it shows, so it renders its own <html> and <body>
// and can count on nothing the layout brings:
// - globals.css is not guaranteed (Next.js gives this file only the styles it imports
//   itself, and it imports none, so that the screen needs no further request on a
//   connection that has just failed);
// - the font variables are gone with the layout's <html> classes, and with them
//   `--font-sans`, even when the stylesheet is still loaded after an error in the browser.
// So every style is inline (the CSP allows it, next.config.ts), with the values of the
// tokens and roles in src/app/globals.css written out (paper, ink, ink-2, accent, white;
// `.container-site`, `.section`, `.h1-page`, `.lead`), the primary Button of
// src/components/site/Button.tsx, and the fallback stack of `--font-sans` as the font.
// No hover colour and no outline are set: the focus ring stays the browser's (or the
// site's own, where globals.css is still there).
//
// The layout's <head> goes as well: `<title>` stands in for the metadata an error file
// cannot export, and the viewport meta repeats the one every page of the site has (Next's
// default; no page sets another), so a phone keeps its width. React moves both to <head>.
//
// `retry` is what Next.js passes to error files: it fetches the page from the server again
// and renders it in place of this screen.

const HEADING = "Ceva nu a mers.";

const styles = {
  body: {
    margin: 0,
    backgroundColor: "#F3F3F0",
    color: "#18191B",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: 17,
    lineHeight: 1.55,
  },
  main: {
    boxSizing: "border-box",
    maxWidth: 1240,
    margin: "0 auto",
    padding: "clamp(64px, 8vw, 112px) clamp(16px, 4vw, 48px)",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  heading: {
    margin: 0,
    fontSize: "clamp(36px, 3.9vw, 56px)",
    lineHeight: 1.04,
    fontWeight: 600,
    letterSpacing: "-0.025em",
  },
  text: {
    margin: 0,
    maxWidth: 520,
    fontSize: "clamp(17px, 1.35vw, 19px)",
    lineHeight: 1.55,
    color: "#4A4D52",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    padding: "0 26px",
    border: 0,
    borderRadius: 2,
    backgroundColor: "#1E4D3B",
    color: "#FFFFFF",
    fontFamily: "inherit",
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.2,
  },
} satisfies Record<string, CSSProperties>;

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ro">
      <body style={styles.body}>
        <title>{HEADING}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <main style={styles.main}>
          <h1 style={styles.heading}>{HEADING}</h1>
          <p style={styles.text}>Pagina nu s-a putut încărca. Verifică legătura la internet și încearcă din nou.</p>
          <div>
            <button type="button" onClick={() => retry()} style={styles.button}>
              Încearcă din nou
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
