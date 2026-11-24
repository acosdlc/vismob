import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_MESSAGES } from "@/lib/admin/catalog-schemas";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import type { PhotoFieldProps } from "./PhotoField";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const saveBase = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-base", () => ({
  saveBase: (...args: [AdminActionState, FormData]) => saveBase(...args),
}));

// PhotoField has its own test; here a stub posts the hidden inputs it would and lets
// the test flip the uploading state the form must honour and press „Șterge poza”.
const photoProps = vi.fn<(props: PhotoFieldProps) => void>();
vi.mock("@/components/admin/PhotoField", () => ({
  PhotoField: (props: PhotoFieldProps) => {
    photoProps(props);
    return (
      <div>
        <label htmlFor={props.id}>{props.label}</label>
        <input id={props.id} type="file" />
        <input type="hidden" name={PHOTO_FIELDS.path} value={props.currentPath ?? ""} />
        <input type="hidden" name={PHOTO_FIELDS.before} value={props.currentPath ?? ""} />
        <p>{props.hint}</p>
        {props.error && <p>{props.error}</p>}
        <button type="button" onClick={() => props.onUploadingChange?.(true)}>
          start upload
        </button>
        <button type="button" onClick={() => props.onUploadingChange?.(false)}>
          end upload
        </button>
        <button type="button" onClick={() => props.onRemove?.()}>
          remove photo
        </button>
      </div>
    );
  },
}));

import { BaseForm, BASE_TEXTS } from "./BaseForm";

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

const PHOTO = "bases/lemn-1792569508760.webp";
const BASE = { id: "lemn", name: "Picioare din lemn", note: "Stejar, 12 cm", code: "PL", photo_path: PHOTO, active: true, sort: 0 };

beforeEach(() => {
  saveBase.mockReset();
  saveBase.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
  photoProps.mockClear();
});

describe("BaseForm", () => {
  it("renders the fields with the row's values, the code as a tag and the 4:3 photo field of the bases folder", () => {
    const { container } = render(<BaseForm base={BASE} />);

    expect(container.querySelector('input[name="id"]')).toHaveValue("lemn");
    expect(screen.getByLabelText("Nume")).toHaveValue("Picioare din lemn");
    const note = screen.getByLabelText("Notă");
    expect(note).toHaveValue("Stejar, 12 cm");
    expect(note).toHaveAccessibleDescription(BASE_TEXTS.noteHint);
    expect(screen.getByText("PL")).toBeInTheDocument();
    expect(container.querySelector('input[name="code"]')).toBeNull();

    expect(screen.getByLabelText(BASE_TEXTS.photoLabel)).toBeInTheDocument();
    expect(screen.getByText(BASE_TEXTS.photoHint)).toBeInTheDocument();
    expect(photoProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ folder: "bases", slug: "lemn", currentPath: PHOTO, ratio: "4:3", label: BASE_TEXTS.photoLabel }),
    );

    expect(screen.getByLabelText(BASE_TEXTS.active)).toBeChecked();
    expect(screen.getByLabelText("Ordine")).toHaveValue(0);
    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("holds the submit while a photo is uploading and releases it after", () => {
    render(<BaseForm base={{ ...BASE, photo_path: null, active: false }} />);
    expect(photoProps).toHaveBeenLastCalledWith(expect.objectContaining({ currentPath: null }));
    expect(screen.getByLabelText(BASE_TEXTS.active)).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "start upload" }));
    const submit = screen.getByRole("button", { name: "Salvează" });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(saveBase).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "end upload" }));
    expect(submit).toBeEnabled();
  });

  it("posts the id, the texts, the flags and the photo path to the action, and shows the saved notice", async () => {
    render(<BaseForm base={BASE} />);
    fireEvent.change(screen.getByLabelText("Notă"), { target: { value: "Stejar, 14 cm" } });
    fireEvent.click(screen.getByLabelText(BASE_TEXTS.active));
    fireEvent.change(screen.getByLabelText("Ordine"), { target: { value: "3" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(saveBase).toHaveBeenCalledTimes(1));
    const formData = saveBase.mock.calls[0][1];
    expect(formData.get("id")).toBe("lemn");
    expect(formData.get("name")).toBe("Picioare din lemn");
    expect(formData.get("note")).toBe("Stejar, 14 cm");
    expect(formData.get("active")).toBeNull();
    expect(formData.get("sort")).toBe("3");
    expect(formData.get(PHOTO_FIELDS.path)).toBe(PHOTO);
    expect(formData.get(PHOTO_FIELDS.before)).toBe(PHOTO);

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(screen.getByLabelText("Notă")).toHaveValue("Stejar, 14 cm");
  });

  it("hides the saved notice as soon as the form is edited after a save, and shows it again after the next save", async () => {
    render(<BaseForm base={BASE} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");

    // Typed after the save: „Salvat.” would speak for a note that is not saved.
    fireEvent.change(screen.getByLabelText("Notă"), { target: { value: "Stejar, 14 cm" } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(screen.getByLabelText("Notă")).toHaveValue("Stejar, 14 cm");

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(saveBase.mock.calls[1][1].get("note")).toBe("Stejar, 14 cm");

    // A tick is an edit as well.
    fireEvent.click(screen.getByLabelText(BASE_TEXTS.active));
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();

    // Saved, then saved once more with nothing changed in between: the notice goes while
    // the save runs and is back with its answer.
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
  });

  it("hides the saved notice when a photo is picked or removed after a save", async () => {
    render(<BaseForm base={BASE} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.saved);
    // „Șterge poza” is a click: no change event reaches the form, the photo field reports it.
    fireEvent.click(screen.getByRole("button", { name: "remove photo" }));
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();

    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.saved);
    // A picked file is a change of the file input, which reaches the form by itself.
    fireEvent.change(screen.getByLabelText(BASE_TEXTS.photoLabel), {
      target: { files: [new File([new Uint8Array(10)], "poza.jpg", { type: "image/jpeg" })] },
    });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
  });

  it("keeps the error notice and the field errors while the form is edited", async () => {
    saveBase.mockResolvedValue({
      status: "error",
      message: CATALOG_MESSAGES.lastBase,
      fieldErrors: { active: CATALOG_MESSAGES.lastBase },
    });
    render(<BaseForm base={BASE} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("alert");
    const active = screen.getByLabelText(BASE_TEXTS.active);
    await waitFor(() => expect(document.activeElement).toBe(active));

    // Another field is edited: nothing the refused save left on screen moves.
    const name = screen.getByLabelText("Nume");
    name.focus();
    fireEvent.change(name, { target: { value: "Picioare din stejar" } });

    expect(screen.getByRole("alert")).toHaveTextContent(CATALOG_MESSAGES.lastBase);
    expect(active).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(CATALOG_MESSAGES.lastBase)).toHaveLength(2);
    expect(document.activeElement).toBe(name);
  });

  it("shows the last-base refusal on the active box and hands a photo error to the photo field", async () => {
    saveBase.mockResolvedValue({
      status: "error",
      message: CATALOG_MESSAGES.lastBase,
      fieldErrors: { active: CATALOG_MESSAGES.lastBase, [PHOTO_FIELDS.path]: ADMIN_MESSAGES.invalid },
    });
    render(<BaseForm base={BASE} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(CATALOG_MESSAGES.lastBase);
    expect(screen.getByLabelText(BASE_TEXTS.active)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(CATALOG_MESSAGES.lastBase)).toHaveLength(2);
    expect(photoProps).toHaveBeenLastCalledWith(expect.objectContaining({ error: ADMIN_MESSAGES.invalid }));
    expect(screen.getByLabelText("Nume")).not.toHaveAttribute("aria-invalid");
  });

  it("shows a plain error without field errors", async () => {
    saveBase.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<BaseForm base={BASE} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText("Nume")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps the form and what was typed when the call to the action fails, and saves on the next try", async () => {
    // No answer comes back: here a dropped connection (a laptop just back from sleep gives the same),
    // which the next try can get past. After a deployment that retired the action's id only a reload helps.
    saveBase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<BaseForm base={BASE} />);
    const note = screen.getByLabelText("Notă");
    fireEvent.change(note, { target: { value: "Stejar, 14 cm" } });
    fireEvent.click(screen.getByLabelText(BASE_TEXTS.active));
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    // Not „Nu am putut salva…”, the server's word for a write that failed: this one may have gone through.
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
    expect(alert.className).toContain("border-error");
    // The same input, not a fresh one with the saved note: the form was never taken down.
    expect(screen.getByLabelText("Notă")).toBe(note);
    expect(note).toHaveValue("Stejar, 14 cm");
    expect(screen.getByLabelText(BASE_TEXTS.active)).not.toBeChecked();
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(saveBase.mock.calls[1][1].get("note")).toBe("Stejar, 14 cm");
    expect(saveBase.mock.calls[1][1].get("active")).toBeNull();
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    const thrown = redirectTo("/admin/catalog");
    saveBase.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <BaseForm base={BASE} />
      </Boundary>,
      { onCaughtError: caught },
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(ADMIN_MESSAGES.noAnswer)).toBeNull();
  });
});
