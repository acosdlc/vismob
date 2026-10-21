import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_MESSAGES, LEAD_STATUS_LABELS, LEAD_STATUSES, type AdminActionState } from "@/lib/admin/types";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const updateLead = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/update-lead", () => ({
  updateLead: (...args: [AdminActionState, FormData]) => updateLead(...args),
}));

import { LeadStatusForm, NOTES_HINT } from "./LeadStatusForm";

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
});
