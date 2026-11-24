import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PanelError from "./error";

describe("the admin panel's error screen", () => {
  it("says in Romanian that the screen could not load, in the letterforms of an admin screen", () => {
    const { container } = render(<PanelError error={new TypeError("Failed to fetch")} retry={() => undefined} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Ceva nu a mers." });
    expect(heading.className).toContain("h2-request");
    expect(screen.getByText("Pagina nu s-a putut încărca. Verifică legătura la internet și încearcă din nou.").tagName).toBe("P");
    const retry = screen.getByRole("button", { name: "Încearcă din nou" });
    expect(retry).toHaveAttribute("type", "button");
    expect(retry.className).toContain("bg-accent");
    // One way out on the screen itself; the menu of the panel is the layout's.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
    // Nothing of the error itself is shown.
    expect(container).not.toHaveTextContent("Failed to fetch");
  });

  it("renders inside the panel's layout: no document, header or main of its own", () => {
    const { container } = render(<PanelError error={new Error("boom")} retry={() => undefined} />);

    expect(container.querySelector("html, body, header, main, nav")).toBeNull();
  });

  it("tries again with the retry Next.js hands to error files", () => {
    const retry = vi.fn();
    render(<PanelError error={new Error("boom")} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Încearcă din nou" }));

    expect(retry).toHaveBeenCalledTimes(1);
    // Called bare: the click event is not passed on to the framework's function.
    expect(retry).toHaveBeenCalledWith();
  });

  it("does not need the error to be an Error (a Client Component may throw anything)", () => {
    render(<PanelError error="offline" retry={() => undefined} />);

    expect(screen.getByRole("heading", { level: 1, name: "Ceva nu a mers." })).toBeInTheDocument();
  });
});
