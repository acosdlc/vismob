import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_MESSAGES, parseFamilyForm, SPEC_ROWS } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const saveFamily = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-family", () => ({
  saveFamily: (...args: [AdminActionState, FormData]) => saveFamily(...args),
}));

import { FamilyForm, FAMILY_TEXTS } from "./FamilyForm";

/** Stands where the framework's boundaries are; React reports what it catches to `onCaughtError`. */
class Boundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };

  static getDerivedStateFromError() {
    return { caught: true };
  }

  render() {
    return this.state.caught ? null : this.props.children;
  }
}

/** What a Server Action's `redirect()` reaches the browser as: the call rejects with it. */
function redirectTo(path: string): unknown {
  try {
    return redirect(path);
  } catch (error) {
    return error;
  }
}

const FAMILY = {
  id: "catifea",
  name: "Catifea",
  code: "CT",
  tab: "textile",
  description: "Moale, cu un luciu discret.",
  specs: [
    { k: "Compoziție", v: "100% poliester" },
    { k: "Frecare", v: "40.000 cicluri Martindale" },
  ],
};

/**
 * A full page load (address bar, reload, new tab): the server's HTML first, then React
 * attaches to inputs it did not create. A browser treats those as untouched until they
 * are typed in, unlike the inputs of a screen opened by a link inside the panel.
 */
function hydrate(ui: ReactElement) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(ui);
  document.body.appendChild(container);
  const served = container.querySelector("input");
  expect(served).toBeInstanceOf(HTMLInputElement);
  const view = render(ui, { container, hydrate: true });
  // React kept the server's inputs: a mismatch would have made it render them anew.
  expect(container.querySelector("input")).toBe(served);
  return view;
}

/** The grid as it is on screen: one „name: value” per row, "" for an empty row. */
function shownRows(): string[] {
  return Array.from({ length: SPEC_ROWS }, (_, i) => {
    const k = screen.getByLabelText<HTMLInputElement>(`Rând ${i + 1}, nume`).value;
    const v = screen.getByLabelText<HTMLInputElement>(`Rând ${i + 1}, valoare`).value;
    return k === "" && v === "" ? "" : `${k}: ${v}`;
  });
}

/** What a submit posts for the grid, in the same shape as shownRows(). */
function postedRows(formData: FormData): string[] {
  return Array.from({ length: SPEC_ROWS }, (_, i) => {
    const k = formData.get(`spec_k_${i + 1}`);
    const v = formData.get(`spec_v_${i + 1}`);
    return k === "" && v === "" ? "" : `${k}: ${v}`;
  });
}

beforeEach(() => {
  saveFamily.mockReset();
  saveFamily.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
});

describe("FamilyForm", () => {
  it("renders the name, the fixed code and tab, the description and SPEC_ROWS labelled rows prefilled from specs", () => {
    const { container } = render(<FamilyForm family={FAMILY} />);

    expect(container.querySelector('input[name="id"]')).toHaveValue("catifea");
    expect(screen.getByLabelText("Nume")).toHaveValue("Catifea");

    expect(screen.getByText("CT")).toBeInTheDocument();
    expect(screen.getByText("textile")).toBeInTheDocument();
    expect(screen.getByText(FAMILY_TEXTS.fixedHint)).toBeInTheDocument();
    expect(container.querySelector('input[name="code"]')).toBeNull();
    expect(container.querySelector('input[name="tab"]')).toBeNull();

    const description = screen.getByLabelText("Descriere");
    expect(description.tagName).toBe("TEXTAREA");
    expect(description).toHaveAttribute("rows", "3");
    expect(description).toHaveValue("Moale, cu un luciu discret.");
    expect(description).toHaveAccessibleDescription(FAMILY_TEXTS.descriptionHint);

    expect(screen.getByRole("group", { name: FAMILY_TEXTS.specsLegend })).toBeInTheDocument();
    for (let row = 1; row <= SPEC_ROWS; row++) {
      const k = screen.getByLabelText(`Rând ${row}, nume`);
      const v = screen.getByLabelText(`Rând ${row}, valoare`);
      expect(k).toHaveAttribute("name", `spec_k_${row}`);
      expect(v).toHaveAttribute("name", `spec_v_${row}`);
      expect(k).toHaveAttribute("maxlength", "80");
      expect(k).toHaveAccessibleDescription(FAMILY_TEXTS.specsHint);
    }
    expect(screen.getByLabelText("Rând 1, nume")).toHaveValue("Compoziție");
    expect(screen.getByLabelText("Rând 1, valoare")).toHaveValue("100% poliester");
    expect(screen.getByLabelText("Rând 2, nume")).toHaveValue("Frecare");
    expect(screen.getByLabelText("Rând 3, nume")).toHaveValue("");
    expect(screen.getByLabelText("Rând 6, valoare")).toHaveValue("");
    expect(screen.queryByLabelText("Rând 7, nume")).toBeNull();

    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("posts the id, the texts and every spec row to the action, and shows the saved notice", async () => {
    render(<FamilyForm family={{ ...FAMILY, description: null, specs: [] }} />);
    expect(screen.getByLabelText("Descriere")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Descriere"), { target: { value: "Paragraf nou." } });
    fireEvent.change(screen.getByLabelText("Rând 2, nume"), { target: { value: "Animale" } });
    fireEvent.change(screen.getByLabelText("Rând 2, valoare"), { target: { value: "potrivit" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(saveFamily).toHaveBeenCalledTimes(1));
    const formData = saveFamily.mock.calls[0][1];
    expect(formData.get("id")).toBe("catifea");
    expect(formData.get("name")).toBe("Catifea");
    expect(formData.get("description")).toBe("Paragraf nou.");
    expect(formData.get("spec_k_1")).toBe("");
    expect(formData.get("spec_k_2")).toBe("Animale");
    expect(formData.get("spec_v_2")).toBe("potrivit");
    expect(formData.get("spec_v_6")).toBe("");
    expect(formData.get("code")).toBeNull();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(screen.getByLabelText("Rând 2, nume")).toHaveValue("Animale");
  });

  it("hides the saved notice as soon as a box is edited after a save, and shows it again after the next save", async () => {
    render(<FamilyForm family={FAMILY} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");

    // Typed after the save: „Salvat.” would speak for a row that is not saved.
    fireEvent.change(screen.getByLabelText("Rând 3, nume"), { target: { value: "Animale" } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(screen.getByLabelText("Rând 3, nume")).toHaveValue("Animale");

    fireEvent.change(screen.getByLabelText("Rând 3, valoare"), { target: { value: "potrivit" } });
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(saveFamily.mock.calls[1][1].get("spec_k_3")).toBe("Animale");

    // The description is an edit as well.
    fireEvent.change(screen.getByLabelText("Descriere"), { target: { value: "Paragraf nou." } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();

    // Saved, then saved once more with nothing changed in between: the notice goes while
    // the save runs and is back with its answer.
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
  });

  it("keeps the alert, the specification error and the focus while the boxes are edited", async () => {
    saveFamily.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { specs: CATALOG_MESSAGES.specs },
    });
    render(<FamilyForm family={FAMILY} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByLabelText("Rând 1, nume")).toHaveFocus());

    // The row is being corrected: nothing the refused save left on screen moves.
    const value = screen.getByLabelText("Rând 2, valoare");
    value.focus();
    fireEvent.change(value, { target: { value: "40.000 cicluri" } });

    expect(screen.getByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(screen.getByText(CATALOG_MESSAGES.specs)).toBeInTheDocument();
    expect(screen.getByLabelText("Rând 1, nume")).toHaveAttribute("aria-invalid", "true");
    expect(value).toHaveFocus();
  });

  it("shows the server's message and marks the spec rows when they are named", async () => {
    saveFamily.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { specs: CATALOG_MESSAGES.specs },
    });
    render(<FamilyForm family={FAMILY} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(screen.getByText(CATALOG_MESSAGES.specs)).toBeInTheDocument();
    expect(screen.getByLabelText("Rând 1, nume")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Rând 6, valoare")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Rând 1, nume")).toHaveAccessibleDescription(`${FAMILY_TEXTS.specsHint} ${CATALOG_MESSAGES.specs}`);
    expect(screen.getByLabelText("Nume")).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(screen.getByLabelText("Rând 1, nume")).toHaveFocus());
  });

  it("shows a plain error without field errors", async () => {
    saveFamily.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<FamilyForm family={FAMILY} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText("Rând 1, nume")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps the form and what was typed when the call to the action fails, and saves on the next try", async () => {
    // No answer comes back: a dropped connection, a laptop just back from sleep, a deployment made meanwhile.
    saveFamily.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<FamilyForm family={FAMILY} />);
    const description = screen.getByLabelText("Descriere");
    fireEvent.change(description, { target: { value: "Paragraf nou." } });
    fireEvent.change(screen.getByLabelText("Rând 3, nume"), { target: { value: "Animale" } });
    fireEvent.change(screen.getByLabelText("Rând 3, valoare"), { target: { value: "potrivit" } });
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.generic);
    expect(alert.className).toContain("border-error");
    // The same textarea, not a fresh one with the saved text: the form was never taken down.
    expect(screen.getByLabelText("Descriere")).toBe(description);
    expect(description).toHaveValue("Paragraf nou.");
    expect(shownRows()).toEqual(["Compoziție: 100% poliester", "Frecare: 40.000 cicluri Martindale", "Animale: potrivit", "", "", ""]);
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(saveFamily.mock.calls[1][1].get("description")).toBe("Paragraf nou.");
    expect(saveFamily.mock.calls[1][1].get("spec_k_3")).toBe("Animale");
    expect(saveFamily.mock.calls[1][1].get("spec_v_3")).toBe("potrivit");
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    const thrown = redirectTo("/admin/catalog");
    saveFamily.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <FamilyForm family={FAMILY} />
      </Boundary>,
      { onCaughtError: caught },
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(ADMIN_MESSAGES.generic)).toBeNull();
  });
});

// The server drops the empty rows and stores the rest in order, and the page hands the
// stored rows back to the same form with the save's answer (updateTag re-renders the
// route). `rerender` plays the page here: the grid has to show what is stored, or the
// next „Salvează” writes what the grid shows.
describe("FamilyForm when the page hands back the stored rows", () => {
  const A = { k: "Compoziție", v: "100% poliester" };
  const B = { k: "Frecare", v: "40.000 cicluri Martindale" };
  const C = { k: "Animale", v: "potrivit" };
  const row = (spec: { k: string; v: string }) => `${spec.k}: ${spec.v}`;

  it("moves a row typed under an empty one up to where it is stored, and the next save posts it once", async () => {
    const family = { ...FAMILY, specs: [] };
    const { rerender } = render(<FamilyForm family={family} />);
    fireEvent.change(screen.getByLabelText("Rând 2, nume"), { target: { value: C.k } });
    fireEvent.change(screen.getByLabelText("Rând 2, valoare"), { target: { value: C.v } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("status");
    expect(postedRows(saveFamily.mock.calls[0][1])).toEqual(["", row(C), "", "", "", ""]);
    // Row 1 was empty, so the one row is stored first.
    rerender(<FamilyForm family={{ ...family, specs: [C] }} />);

    expect(shownRows()).toEqual([row(C), "", "", "", "", ""]);
    // The rebuilt grid is what was saved: the notice still stands.
    expect(screen.getByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await waitFor(() => expect(saveFamily).toHaveBeenCalledTimes(2));
    expect(postedRows(saveFamily.mock.calls[1][1])).toEqual([row(C), "", "", "", "", ""]);
  });

  it("after a full page load, closes the gap of an emptied middle row instead of losing the row under it", async () => {
    const { rerender } = hydrate(<FamilyForm family={{ ...FAMILY, specs: [A, B, C] }} />);
    expect(shownRows()).toEqual([row(A), row(B), row(C), "", "", ""]);
    fireEvent.change(screen.getByLabelText("Rând 2, nume"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Rând 2, valoare"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("status");
    expect(postedRows(saveFamily.mock.calls[0][1])).toEqual([row(A), "", row(C), "", "", ""]);
    rerender(<FamilyForm family={{ ...FAMILY, specs: [A, C] }} />);

    expect(shownRows()).toEqual([row(A), row(C), "", "", "", ""]);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await waitFor(() => expect(saveFamily).toHaveBeenCalledTimes(2));
    expect(postedRows(saveFamily.mock.calls[1][1])).toEqual([row(A), row(C), "", "", "", ""]);
  });

  it("keeps what was typed after a refused save: the stored rows did not change", async () => {
    saveFamily.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { specs: CATALOG_MESSAGES.specs },
    });
    const family = { ...FAMILY, specs: [A, B] };
    const { rerender } = render(<FamilyForm family={family} />);
    // A half-filled row under an empty one: the server refuses the save and stores nothing.
    fireEvent.change(screen.getByLabelText("Rând 4, nume"), { target: { value: C.k } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByLabelText("Rând 1, nume")).toHaveFocus());
    // The page reads the row again: equal rows, in a new array.
    rerender(<FamilyForm family={{ ...family, specs: [{ ...A }, { ...B }] }} />);

    expect(shownRows()).toEqual([row(A), row(B), "", `${C.k}: `, "", ""]);
    expect(screen.getByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(screen.getByLabelText("Rând 1, nume")).toHaveFocus();
  });

  it("leaves the grid alone when a save does not change the stored rows (the name alone)", async () => {
    const family = { ...FAMILY, specs: [A, B] };
    const { rerender } = render(<FamilyForm family={family} />);
    const box = screen.getByLabelText("Rând 2, valoare");
    fireEvent.change(screen.getByLabelText("Nume"), { target: { value: "Catifea fină" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("status");
    rerender(<FamilyForm family={{ ...family, name: "Catifea fină", specs: [{ ...A }, { ...B }] }} />);

    // Equal rows in a new array are the same rows: no box is replaced (a replaced box loses the cursor).
    expect(screen.getByLabelText("Rând 2, valoare")).toBe(box);
    expect(shownRows()).toEqual([row(A), row(B), "", "", "", ""]);
    expect(screen.getByLabelText("Nume")).toHaveValue("Catifea fină");
  });

  // The whole loop, with the server's own rule for what is stored (parseFamilyForm): one
  // edit, then „Salvează” three times with nothing typed in between. Every save has to
  // store the same rows; a grid out of step stores a row twice or one row fewer each time.
  describe.each([
    ["a screen opened inside the panel", (ui: ReactElement) => render(ui)],
    ["a full page load", hydrate],
  ])("on %s", (_screen, open) => {
    it.each<[string, { k: string; v: string }[], [label: string, value: string][], { k: string; v: string }[]]>([
      ["a row typed under an empty row", [A, B], [["Rând 4, nume", C.k], ["Rând 4, valoare", C.v]], [A, B, C]],
      ["a middle row emptied", [A, B, C], [["Rând 2, nume", ""], ["Rând 2, valoare", ""]], [A, C]],
      ["a row typed right under the last one", [A, B], [["Rând 3, nume", C.k], ["Rând 3, valoare", C.v]], [A, B, C]],
    ])("stores the same rows save after save: %s", async (_edit, initial, edits, expected) => {
      const view = open(<FamilyForm family={{ ...FAMILY, specs: initial }} />);
      for (const [label, value] of edits) fireEvent.change(screen.getByLabelText(label), { target: { value } });
      const submit = screen.getByRole("button", { name: "Salvează" });
      const blanks = Array.from({ length: SPEC_ROWS - expected.length }, () => "");

      for (let save = 1; save <= 3; save++) {
        fireEvent.click(submit);
        await waitFor(() => expect(saveFamily).toHaveBeenCalledTimes(save));
        await waitFor(() => expect(submit).toBeEnabled());
        const parsed = parseFamilyForm(saveFamily.mock.calls[save - 1][1]);
        const stored = parsed.ok ? parsed.data.specs : null;
        expect(stored, `save ${save}`).toEqual(expected);
        // The page passes the stored rows back with the save's answer.
        view.rerender(<FamilyForm family={{ ...FAMILY, specs: stored ?? [] }} />);
        expect(shownRows(), `after save ${save}`).toEqual([...expected.map(row), ...blanks]);
      }
    });
  });
});
