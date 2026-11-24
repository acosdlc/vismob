import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_MESSAGES } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const saveModel = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-model", () => ({
  saveModel: (...args: [AdminActionState, FormData]) => saveModel(...args),
}));

import { ModelForm, MODEL_TEXTS } from "./ModelForm";

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

const MODEL = {
  id: "capitonat",
  name: "Capitonat",
  note: "Tapițat, cu nasturi",
  code: "CAP",
  description: "Textul cardului.",
  active: true,
  sort: 2,
};

const FAMILIES = [
  { id: "catifea", name: "Catifea", code: "CT" },
  { id: "boucle", name: "Bouclé", code: "BC" },
  { id: "lemn", name: "Lemn masiv", code: "LM" },
];

const checkbox = (name: RegExp) => screen.getByRole("checkbox", { name });

beforeEach(() => {
  saveModel.mockReset();
  saveModel.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
});

describe("ModelForm", () => {
  it("renders the fields with the row's values, the code as a tag and one checkbox per family", () => {
    const { container } = render(<ModelForm model={MODEL} families={FAMILIES} selected={["catifea", "boucle"]} />);

    expect(container.querySelector('input[name="id"]')).toHaveValue("capitonat");
    expect(screen.getByLabelText("Nume")).toHaveValue("Capitonat");
    expect(screen.getByLabelText("Nume")).toHaveAttribute("maxlength", "80");

    const note = screen.getByLabelText("Notă scurtă");
    expect(note).toHaveValue("Tapițat, cu nasturi");
    expect(note).toHaveAccessibleDescription(MODEL_TEXTS.noteHint);

    const description = screen.getByLabelText("Descriere");
    expect(description.tagName).toBe("TEXTAREA");
    expect(description).toHaveAttribute("rows", "4");
    expect(description).toHaveValue("Textul cardului.");
    expect(description).toHaveAccessibleDescription(MODEL_TEXTS.descriptionHint);

    expect(screen.getByText("CAP")).toBeInTheDocument();
    expect(container.querySelector('input[name="code"]')).toBeNull();

    expect(screen.getByRole("group", { name: MODEL_TEXTS.familiesLegend })).toBeInTheDocument();
    expect(checkbox(/Catifea/)).toBeChecked();
    expect(checkbox(/Bouclé/)).toBeChecked();
    expect(checkbox(/Lemn masiv/)).not.toBeChecked();
    expect(checkbox(/Catifea/)).toHaveAttribute("name", "families");
    expect(checkbox(/Catifea/)).toHaveAttribute("value", "catifea");
    expect(checkbox(/Catifea/)).toHaveAccessibleDescription(MODEL_TEXTS.familiesHint);
    expect(screen.getByText("CT")).toBeInTheDocument();

    expect(screen.getByLabelText(MODEL_TEXTS.active)).toBeChecked();
    expect(screen.getByLabelText("Ordine")).toHaveValue(2);
    expect(screen.getByLabelText("Ordine")).toHaveAttribute("type", "number");

    const submit = screen.getByRole("button", { name: "Salvează" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts with an empty description and an unticked active box for such a row", () => {
    render(<ModelForm model={{ ...MODEL, description: null, active: false }} families={FAMILIES} selected={[]} />);
    expect(screen.getByLabelText("Descriere")).toHaveValue("");
    expect(screen.getByLabelText(MODEL_TEXTS.active)).not.toBeChecked();
    FAMILIES.forEach((family) => expect(checkbox(new RegExp(family.name))).not.toBeChecked());
  });

  it("posts the id, the texts, every ticked family and the flags to the action, and shows the saved notice", async () => {
    render(<ModelForm model={MODEL} families={FAMILIES} selected={["catifea", "boucle"]} />);
    fireEvent.change(screen.getByLabelText("Nume"), { target: { value: "Capitonat nou" } });
    fireEvent.click(checkbox(/Bouclé/));
    fireEvent.click(checkbox(/Lemn masiv/));
    fireEvent.click(screen.getByLabelText(MODEL_TEXTS.active));
    fireEvent.change(screen.getByLabelText("Ordine"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(saveModel).toHaveBeenCalledTimes(1));
    const formData = saveModel.mock.calls[0][1];
    expect(formData.get("id")).toBe("capitonat");
    expect(formData.get("name")).toBe("Capitonat nou");
    expect(formData.get("note")).toBe("Tapițat, cu nasturi");
    expect(formData.get("description")).toBe("Textul cardului.");
    expect(formData.getAll("families")).toEqual(["catifea", "lemn"]);
    expect(formData.get("active")).toBeNull();
    expect(formData.get("sort")).toBe("5");

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(screen.getByLabelText("Nume")).toHaveValue("Capitonat nou");
    expect(checkbox(/Lemn masiv/)).toBeChecked();
  });

  it("hides the saved notice as soon as the form is edited after a save, and shows it again after the next save", async () => {
    render(<ModelForm model={MODEL} families={FAMILIES} selected={["catifea", "boucle"]} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");

    // A family ticked after the save: „Salvat.” would speak for a rule that is not saved.
    fireEvent.click(checkbox(/Lemn masiv/));
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(checkbox(/Lemn masiv/)).toBeChecked();

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(saveModel.mock.calls[1][1].getAll("families")).toEqual(["catifea", "boucle", "lemn"]);

    // Typing is an edit as well.
    fireEvent.change(screen.getByLabelText("Descriere"), { target: { value: "Text nou." } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();

    // Saved, then saved once more with nothing changed in between: the notice goes while
    // the save runs and is back with its answer.
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
  });

  it("keeps the error notice, the field errors and the focus while the form is edited", async () => {
    saveModel.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { families: CATALOG_MESSAGES.noFamily },
    });
    render(<ModelForm model={MODEL} families={FAMILIES} selected={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(checkbox(/Catifea/)).toHaveFocus());

    // Another field is edited: nothing the refused save left on screen moves.
    const name = screen.getByLabelText("Nume");
    name.focus();
    fireEvent.change(name, { target: { value: "Capitonat nou" } });

    expect(screen.getByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(screen.getByText(CATALOG_MESSAGES.noFamily)).toBeInTheDocument();
    expect(checkbox(/Catifea/)).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
  });

  it("shows the server's message and marks the fields it names, the family group included", async () => {
    saveModel.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { name: ADMIN_MESSAGES.required, families: CATALOG_MESSAGES.noFamily },
    });
    render(<ModelForm model={MODEL} families={FAMILIES} selected={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");
    expect(screen.getByLabelText("Nume")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(ADMIN_MESSAGES.required)).toBeInTheDocument();
    expect(screen.getByText(CATALOG_MESSAGES.noFamily)).toBeInTheDocument();
    expect(checkbox(/Catifea/)).toHaveAttribute("aria-invalid", "true");
    expect(checkbox(/Catifea/)).toHaveAccessibleDescription(`${MODEL_TEXTS.familiesHint} ${CATALOG_MESSAGES.noFamily}`);
    expect(screen.getByLabelText("Notă scurtă")).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(screen.getByLabelText("Nume")).toHaveFocus());
  });

  it("shows a plain error without field errors", async () => {
    saveModel.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<ModelForm model={MODEL} families={FAMILIES} selected={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText("Nume")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps the form and what was typed when the call to the action fails, and saves on the next try", async () => {
    // No answer comes back: here a dropped connection (a laptop just back from sleep gives the same),
    // which the next try can get past. After a deployment that retired the action's id only a reload helps.
    saveModel.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ModelForm model={MODEL} families={FAMILIES} selected={["catifea"]} />);
    const description = screen.getByLabelText("Descriere");
    fireEvent.change(description, { target: { value: "Text nou pentru card." } });
    fireEvent.click(checkbox(/Lemn masiv/));
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    // Not „Nu am putut salva…”, the server's word for a write that failed: this one may have gone through.
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
    expect(alert.className).toContain("border-error");
    // The same textarea, not a fresh one with the saved text: the form was never taken down.
    expect(screen.getByLabelText("Descriere")).toBe(description);
    expect(description).toHaveValue("Text nou pentru card.");
    expect(checkbox(/Lemn masiv/)).toBeChecked();
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(saveModel.mock.calls[1][1].get("description")).toBe("Text nou pentru card.");
    expect(saveModel.mock.calls[1][1].getAll("families")).toEqual(["catifea", "lemn"]);
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    const thrown = redirectTo("/admin/catalog");
    saveModel.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <ModelForm model={MODEL} families={FAMILIES} selected={["catifea"]} />
      </Boundary>,
      { onCaughtError: caught },
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(ADMIN_MESSAGES.noAnswer)).toBeNull();
  });
});
