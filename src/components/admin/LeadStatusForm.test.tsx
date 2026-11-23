import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_MESSAGES, LEAD_STATUS_LABELS, LEAD_STATUSES, type AdminActionState } from "@/lib/admin/types";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const updateLead = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/update-lead", () => ({
  updateLead: (...args: [AdminActionState, FormData]) => updateLead(...args),
}));

import { LeadStatusForm, NOTES_HINT } from "./LeadStatusForm";

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

const LEAD_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  updateLead.mockReset();
  updateLead.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
});

describe("LeadStatusForm", () => {
  it("renders the status select with every status, the notes with their hint, and the current values", () => {
    render(<LeadStatusForm leadId={LEAD_ID} status="contactat" notes="Sunat marți." />);

    expect(screen.getByRole("heading", { level: 2, name: "Status și note" })).toBeInTheDocument();

    const select = screen.getByLabelText("Status");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute("name", "status");
    expect(select).toHaveValue("contactat");
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((o) => o.value)).toEqual([...LEAD_STATUSES]);
    expect(options.map((o) => o.textContent)).toEqual(LEAD_STATUSES.map((s) => LEAD_STATUS_LABELS[s]));
    expect(screen.getByRole("option", { name: "Câștigat" })).toHaveValue("castigat");

    const notes = screen.getByLabelText("Note interne");
    expect(notes.tagName).toBe("TEXTAREA");
    expect(notes).toHaveAttribute("name", "notes");
    expect(notes).toHaveAttribute("rows", "6");
    expect(notes).toHaveAttribute("maxlength", "4000");
    expect(notes).toHaveValue("Sunat marți.");
    expect(notes).toHaveAccessibleDescription(NOTES_HINT);

    const submit = screen.getByRole("button", { name: "Salvează" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts empty when there are no notes", () => {
    render(<LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />);
    expect(screen.getByLabelText("Note interne")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("nou");
  });

  it("posts leadId, status and notes to the action and shows the saved notice, keeping the values", async () => {
    render(<LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ofertat" } });
    fireEvent.change(screen.getByLabelText("Note interne"), { target: { value: "Ofertă trimisă." } });

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(updateLead).toHaveBeenCalledTimes(1));
    const formData = updateLead.mock.calls[0][1];
    expect(formData.get("leadId")).toBe(LEAD_ID);
    expect(formData.get("status")).toBe("ofertat");
    expect(formData.get("notes")).toBe("Ofertă trimisă.");

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(screen.getByLabelText("Status")).toHaveValue("ofertat");
    expect(screen.getByLabelText("Note interne")).toHaveValue("Ofertă trimisă.");
    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
  });

  it("hides the saved notice as soon as the form is edited after a save, and shows it again after the next save", async () => {
    render(<LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");

    // Chosen after the save: „Salvat.” would speak for a status that is not saved.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ofertat" } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(screen.getByLabelText("Status")).toHaveValue("ofertat");

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(updateLead.mock.calls[1][1].get("status")).toBe("ofertat");

    // Typed notes are an edit as well.
    fireEvent.change(screen.getByLabelText("Note interne"), { target: { value: "Ofertă trimisă." } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();

    // Saved, then saved once more with nothing changed in between: the notice goes while
    // the save runs and is back with its answer.
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    expect(updateLead).toHaveBeenCalledTimes(4);
  });

  it("keeps the error notice and the field error while the form is edited", async () => {
    updateLead.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { notes: ADMIN_MESSAGES.tooLong },
    });
    render(<LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("alert");

    // The notes are being shortened: nothing the refused save left on screen moves.
    const notes = screen.getByLabelText("Note interne");
    fireEvent.change(notes, { target: { value: "Mai scurt." } });

    expect(screen.getByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(notes).toHaveAttribute("aria-invalid", "true");
    expect(notes).toHaveAccessibleDescription(`${NOTES_HINT} ${ADMIN_MESSAGES.tooLong}`);
  });

  it("shows the server's message and marks the field it names", async () => {
    updateLead.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { notes: ADMIN_MESSAGES.tooLong },
    });
    render(<LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");
    const notes = screen.getByLabelText("Note interne");
    expect(notes).toHaveAttribute("aria-invalid", "true");
    expect(notes).toHaveAccessibleDescription(`${NOTES_HINT} ${ADMIN_MESSAGES.tooLong}`);
    expect(screen.getByLabelText("Status")).not.toHaveAttribute("aria-invalid");
  });

  it("shows a plain error without field errors", async () => {
    updateLead.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText("Note interne")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps the chosen status and the typed notes when the call to the action fails, and saves on the next try", async () => {
    // No answer comes back: a dropped connection, a laptop just back from sleep, a deployment made meanwhile.
    updateLead.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />);
    const notes = screen.getByLabelText("Note interne");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ofertat" } });
    fireEvent.change(notes, { target: { value: "Ofertă trimisă." } });
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.generic);
    expect(alert.className).toContain("border-error");
    // The same textarea, not a fresh one with the saved notes: the form was never taken down.
    expect(screen.getByLabelText("Note interne")).toBe(notes);
    expect(notes).toHaveValue("Ofertă trimisă.");
    expect(screen.getByLabelText("Status")).toHaveValue("ofertat");
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(updateLead.mock.calls[1][1].get("status")).toBe("ofertat");
    expect(updateLead.mock.calls[1][1].get("notes")).toBe("Ofertă trimisă.");
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    const thrown = redirectTo("/admin/cereri");
    updateLead.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <LeadStatusForm leadId={LEAD_ID} status="nou" notes={null} />
      </Boundary>,
      { onCaughtError: caught },
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(ADMIN_MESSAGES.generic)).toBeNull();
  });
});
