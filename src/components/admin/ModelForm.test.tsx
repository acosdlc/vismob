import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_MESSAGES } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const saveModel = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-model", () => ({
  saveModel: (...args: [AdminActionState, FormData]) => saveModel(...args),
}));

import { ModelForm, MODEL_TEXTS } from "./ModelForm";

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
    expect(screen.getByLabelText("Nume")).toHaveFocus();
  });

  it("shows a plain error without field errors", async () => {
    saveModel.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<ModelForm model={MODEL} families={FAMILIES} selected={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText("Nume")).not.toHaveAttribute("aria-invalid");
  });
});
