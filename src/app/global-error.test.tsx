import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

const HEADING = "Ceva nu a mers.";
const TEXT = "Pagina nu s-a putut încărca. Verifică legătura la internet și încearcă din nou.";
const RETRY = "Încearcă din nou";

/** The screen replaces the root layout, so it is rendered as the document, not inside a `<div>`. */
function show(retry: () => void = () => undefined, error: unknown = new TypeError("Failed to fetch")) {
  return render(<GlobalError error={error} retry={retry} />, { container: document });
}

afterEach(() => {
  document.documentElement.removeAttribute("lang");
});

describe("the site's last error screen", () => {
  it("is a document of its own, in Romanian, with a title and the site's viewport", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("boom")} retry={() => undefined} />);

    // What the root layout would have brought: this file replaces it, <head> included.
    expect(html).toMatch(/^<html lang="ro"><head>/);
    expect(html).toContain("</head><body");
    expect(html).toContain(`<title>${HEADING}</title>`);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1"/>');
    expect(html.indexOf("<meta")).toBeLessThan(html.indexOf("</head>"));
  });

  it("says that the page could not load and offers one way out, and nothing of the error itself", () => {
    show();

    expect(document.documentElement).toHaveAttribute("lang", "ro");
    expect(document.title).toBe(HEADING);
    expect(document.head.querySelector('meta[name="viewport"]')).toHaveAttribute("content", "width=device-width, initial-scale=1");
    expect(screen.getByRole("heading", { level: 1, name: HEADING })).toBeInTheDocument();
    expect(screen.getByText(TEXT).tagName).toBe("P");
    expect(screen.getByRole("button", { name: RETRY })).toHaveAttribute("type", "button");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body).not.toHaveTextContent("Failed to fetch");
  });

  it("tries again with the retry Next.js hands to error files", () => {
    const retry = vi.fn();
    show(retry);

    fireEvent.click(screen.getByRole("button", { name: RETRY }));

    expect(retry).toHaveBeenCalledTimes(1);
    // Called bare: the click event is not passed on to the framework's function.
    expect(retry).toHaveBeenCalledWith();
  });

  it("styles itself: no class, no stylesheet variable and no font of the root layout is needed", () => {
    show();
    const body = document.body;
    const heading = screen.getByRole("heading", { level: 1, name: HEADING });
    const button = screen.getByRole("button", { name: RETRY });

    // globals.css is not guaranteed here and the layout's <html> classes are gone.
    for (const element of [body, ...body.querySelectorAll("*")]) {
      expect(element.getAttribute("class"), element.tagName).toBeNull();
      expect(element.getAttribute("style") ?? "", element.tagName).not.toContain("var(");
    }
    // The tokens' own values (src/app/globals.css): paper, ink, accent, white; the fallback fonts of --font-sans.
    expect(body).toHaveStyle({ backgroundColor: "#F3F3F0", color: "#18191B", margin: "0px" });
    expect(body.style.fontFamily).toBe('"Helvetica Neue", Helvetica, Arial, sans-serif');
    expect(heading).toHaveStyle({ fontWeight: "600", margin: "0px" });
    expect(button).toHaveStyle({ backgroundColor: "#1E4D3B", color: "#FFFFFF", minHeight: "52px", fontWeight: "600" });
    // The focus ring is left to the browser (or to globals.css when it is still loaded): never switched off.
    expect(button.style.outline).toBe("");
  });

  it("does not need the error to be an Error (a Client Component may throw anything)", () => {
    show(undefined, "offline");

    expect(screen.getByRole("heading", { level: 1, name: HEADING })).toBeInTheDocument();
  });
});
