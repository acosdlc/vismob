import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_MESSAGES, SPEC_ROWS } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const saveFamily = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-family", () => ({
  saveFamily: (...args: [AdminActionState, FormData]) => saveFamily(...args),
}));

import { FamilyForm, FAMILY_TEXTS } from "./FamilyForm";

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
    expect(screen.getByLabelText("Rând 1, nume")).toHaveFocus();
  });

  it("shows a plain error without field errors", async () => {
    saveFamily.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<FamilyForm family={FAMILY} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText("Rând 1, nume")).not.toHaveAttribute("aria-invalid");
  });
});
