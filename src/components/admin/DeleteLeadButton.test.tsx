import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Action is replaced: the test drives the button, not the delete (src/actions/admin).
const deleteLead = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/delete-lead", () => ({
  deleteLead: (...args: [AdminActionState, FormData]) => deleteLead(...args),
}));

import { DeleteLeadButton, deleteConfirmText } from "./DeleteLeadButton";

const LEAD_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  deleteLead.mockReset();
  // On success the real action redirects; here it simply resolves to the idle state.
  deleteLead.mockResolvedValue({ status: "idle" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeleteLeadButton", () => {
  it("renders the secondary button, the hidden id and the warning line", () => {
    render(<DeleteLeadButton leadId={LEAD_ID} name="Ana Pop" />);

    const button = screen.getByRole("button", { name: "Șterge cererea" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeEnabled();
    expect(button.className).toContain("border-ink");
    expect(screen.getByText("Ștergerea e definitivă.")).toBeInTheDocument();
    const hidden = button.closest("form")!.querySelector('input[name="leadId"]');
    expect(hidden).toHaveAttribute("type", "hidden");
    expect(hidden).toHaveValue(LEAD_ID);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for confirmation with the client's name and does nothing when declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DeleteLeadButton leadId={LEAD_ID} name="Ana Pop" />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge cererea" }));

    expect(confirm).toHaveBeenCalledWith(deleteConfirmText("Ana Pop"));
    expect(confirm).toHaveBeenCalledWith("Ștergi definitiv cererea de la Ana Pop? Pozele ei se șterg și ele.");
    // The action never runs: a declined confirmation prevents the submit.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteLead).not.toHaveBeenCalled();
  });

  it("posts the lead id to the action once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DeleteLeadButton leadId={LEAD_ID} name="Ana Pop" />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge cererea" }));

    await waitFor(() => expect(deleteLead).toHaveBeenCalledTimes(1));
    expect(deleteLead.mock.calls[0][1].get("leadId")).toBe(LEAD_ID);
  });

  it("shows the action's error in an alert", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteLead.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<DeleteLeadButton leadId={LEAD_ID} name="Ana Pop" />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge cererea" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(alert.className).toContain("border-error");
    expect(screen.getByRole("button", { name: "Șterge cererea" })).toBeEnabled();
  });
});
