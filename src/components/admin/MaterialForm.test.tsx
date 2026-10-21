import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_MESSAGES } from "@/lib/admin/materials";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Actions are replaced: the test drives the form, not the writes (src/actions/admin).
const saveMaterial = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-material", () => ({
  saveMaterial: (...args: [AdminActionState, FormData]) => saveMaterial(...args),
}));
const deleteMaterial = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/delete-material", () => ({
  deleteMaterial: (...args: [AdminActionState, FormData]) => deleteMaterial(...args),
}));

// PhotoField's upload path: the bucket answers at once, compression is the identity (jsdom has no canvas).
const upload = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ upload }) } }) }));
vi.mock("browser-image-compression", () => ({ default: async (file: File) => file }));

import { deleteMaterialConfirmText } from "./DeleteMaterialButton";
import { MATERIAL_FORM_TEXTS, MaterialForm, type MaterialFormFamily, type MaterialFormMaterial } from "./MaterialForm";
import { PHOTO_TEXTS } from "./PhotoField";

const FAMILIES: MaterialFormFamily[] = [
  { id: "catifea", name: "Catifea", code: "CT" },
  { id: "boucle", name: "Bouclé", code: "BC" },
  { id: "lemn", name: "Lemn masiv", code: "LM" },
];

const PHOTO = "materials/ct-verde-1792569508760.webp";

const MATERIAL: MaterialFormMaterial = {
  id: "ct-verde",
  family_id: "catifea",
  name: "Verde sticlă",
  code: "CT01",
  hex: "#2F4B3C",
  supplier: "Textil SRL",
  supplier_code: "VS-220",
  price_category: "B",
  photo_path: PHOTO,
  featured: true,
  active: true,
  sort: 3,
};

const T = MATERIAL_FORM_TEXTS;

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
}

function pickPhoto() {
  const input = screen.getByLabelText(T.photo);
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], "poza.jpg", { type: "image/jpeg" })] } });
}

beforeEach(() => {
  saveMaterial.mockReset();
  saveMaterial.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
  deleteMaterial.mockReset();
  // On success the real action redirects; here it simply resolves to the idle state.
  deleteMaterial.mockResolvedValue({ status: "idle" });
  upload.mockReset().mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MaterialForm for a new material", () => {
  it("renders a labelled control for every column, with the defaults, and no code or delete", () => {
    render(<MaterialForm material={null} families={FAMILIES} />);

    expect(hidden("id")).toHaveValue("");
    expect(hidden("family_id")).toBeNull();

    const family = screen.getByLabelText(T.family);
    expect(family.tagName).toBe("SELECT");
    expect(family).toHaveAttribute("name", "family_id");
    expect(family).toBeEnabled();
    expect(family).toHaveValue("catifea");
    expect(Array.from(family.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Catifea (CT)", "Bouclé (BC)", "Lemn masiv (LM)"]);
    expect(family).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(T.familyFixed)).toBeNull();
    expect(screen.queryByText(T.code)).toBeNull();

    const name = screen.getByLabelText(T.name);
    expect(name).toHaveAttribute("name", "name");
    expect(name).toHaveAttribute("maxlength", "80");
    expect(name).toHaveValue("");

    const hex = screen.getByLabelText(T.hex);
    expect(hex).toHaveAttribute("name", "hex");
    expect(hex).toHaveAttribute("type", "text");
    expect(hex).toHaveAttribute("maxlength", "7");
    expect(hex).toHaveAttribute("placeholder", "#2F4B3C");
    expect(hex).not.toHaveAttribute("inputmode");
    expect(hex).toHaveValue("");
    const preview = screen.getByTestId("hex-preview");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview.className).toContain("size-11");
    expect(preview.style.backgroundColor).toBe("");

    expect(screen.getByLabelText(T.supplier)).toHaveAttribute("name", "supplier");
    expect(screen.getByLabelText(T.supplier)).toHaveAttribute("maxlength", "120");
    expect(screen.getByLabelText(T.supplierCode)).toHaveAttribute("name", "supplier_code");
    expect(screen.getByLabelText(T.supplierCode)).toHaveAttribute("maxlength", "60");

    const category = screen.getByLabelText(T.priceCategory);
    expect(category.tagName).toBe("SELECT");
    expect(category).toHaveAttribute("name", "price_category");
    expect(category).toHaveValue("A");
    expect(Array.from(category.querySelectorAll("option")).map((o) => o.value)).toEqual(["A", "B", "C"]);
    expect(category).toHaveAccessibleDescription(T.priceCategoryHint);

    const featured = screen.getByRole("checkbox", { name: T.featured });
    expect(featured).toHaveAttribute("name", "featured");
    expect(featured).not.toBeChecked();
    const active = screen.getByRole("checkbox", { name: T.active });
    expect(active).toHaveAttribute("name", "active");
    expect(active).toBeChecked();

    const sort = screen.getByLabelText(T.sort);
    expect(sort).toHaveAttribute("name", "sort");
    expect(sort).toHaveAttribute("type", "number");
    expect(sort).toHaveAttribute("min", "0");
    expect(sort).toHaveValue(0);

    const photo = screen.getByLabelText(T.photo);
    expect(photo).toHaveAttribute("type", "file");
    expect(screen.getByText(T.photoHint)).toBeInTheDocument();
    expect(hidden(PHOTO_FIELDS.path)).toHaveValue("");
    expect(hidden(PHOTO_FIELDS.before)).toHaveValue("");
    expect(screen.getByText(PHOTO_TEXTS.none)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: T.submit });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Șterge materialul" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("previews the colour as it is typed, once it is a full #RRGGBB", () => {
    render(<MaterialForm material={null} families={FAMILIES} />);
    const hex = screen.getByLabelText(T.hex);
    fireEvent.change(hex, { target: { value: "#B98A" } });
    expect(screen.getByTestId("hex-preview").style.backgroundColor).toBe("");
    fireEvent.change(hex, { target: { value: "#B98A2E" } });
    expect(screen.getByTestId("hex-preview")).toHaveStyle({ backgroundColor: "#B98A2E" });
    expect(hex).toHaveValue("#B98A2E");
  });

  it("posts every field to the action, keeps the typed values and shows the notice", async () => {
    render(<MaterialForm material={null} families={FAMILIES} />);
    fireEvent.change(screen.getByLabelText(T.family), { target: { value: "boucle" } });
    fireEvent.change(screen.getByLabelText(T.name), { target: { value: "Nisip" } });
    fireEvent.change(screen.getByLabelText(T.hex), { target: { value: "#cdbfa6" } });
    fireEvent.change(screen.getByLabelText(T.supplier), { target: { value: "Textil SRL" } });
    fireEvent.change(screen.getByLabelText(T.priceCategory), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText(T.sort), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("checkbox", { name: T.featured }));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(saveMaterial).toHaveBeenCalledTimes(1));
    const formData = saveMaterial.mock.calls[0][1];
    expect(formData.get("id")).toBe("");
    expect(formData.get("family_id")).toBe("boucle");
    expect(formData.get("name")).toBe("Nisip");
    expect(formData.get("hex")).toBe("#cdbfa6");
    expect(formData.get("supplier")).toBe("Textil SRL");
    expect(formData.get("supplier_code")).toBe("");
    expect(formData.get("price_category")).toBe("C");
    expect(formData.get("sort")).toBe("4");
    expect(formData.get("featured")).toBe("on");
    expect(formData.get("active")).toBe("on");
    expect(formData.get(PHOTO_FIELDS.path)).toBe("");
    expect(formData.get(PHOTO_FIELDS.before)).toBe("");

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(screen.getByLabelText(T.name)).toHaveValue("Nisip");
    expect(screen.getByLabelText(T.hex)).toHaveValue("#cdbfa6");
    expect(screen.getByLabelText(T.priceCategory)).toHaveValue("C");
    expect(screen.getByRole("button", { name: T.submit })).toBeEnabled();
  });

  it("shows the server's message and field errors, and focuses the first invalid field in form order", async () => {
    saveMaterial.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { hex: MATERIAL_MESSAGES.hex, name: ADMIN_MESSAGES.required, [PHOTO_FIELDS.path]: ADMIN_MESSAGES.invalid },
    });
    render(<MaterialForm material={null} families={FAMILIES} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");

    const name = screen.getByLabelText(T.name);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(ADMIN_MESSAGES.required);
    const hex = screen.getByLabelText(T.hex);
    expect(hex).toHaveAttribute("aria-invalid", "true");
    expect(hex).toHaveAccessibleDescription(MATERIAL_MESSAGES.hex);
    expect(screen.getByLabelText(T.photo)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(T.supplier)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText(T.family)).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });

  it("marks the active checkbox when the server refuses the last colour", async () => {
    saveMaterial.mockResolvedValue({
      status: "error",
      message: MATERIAL_MESSAGES.lastColor,
      fieldErrors: { active: MATERIAL_MESSAGES.lastColor },
    });
    render(<MaterialForm material={MATERIAL} families={FAMILIES} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(MATERIAL_MESSAGES.lastColor);
    const active = screen.getByRole("checkbox", { name: T.active });
    expect(active).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(document.activeElement).toBe(active));
  });

  it("holds the submit while a photo is uploading, then posts the uploaded path", async () => {
    render(<MaterialForm material={null} families={FAMILIES} />);
    const submit = screen.getByRole("button", { name: T.submit });

    pickPhoto();
    expect(submit).toBeDisabled();
    // A scripted submit during the upload must not reach the action either.
    fireEvent.submit(submit.closest("form")!);
    expect(saveMaterial).not.toHaveBeenCalled();

    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument();
    const [path] = upload.mock.calls[0];
    expect(path).toMatch(/^materials\/[a-z0-9-]+-\d{13}\.webp$/);

    fireEvent.click(submit);
    await waitFor(() => expect(saveMaterial).toHaveBeenCalledTimes(1));
    expect(saveMaterial.mock.calls[0][1].get(PHOTO_FIELDS.path)).toBe(path);
  });
});

describe("MaterialForm for an existing material", () => {
  it("fills the values, fixes the family and the code, and offers the delete", () => {
    render(<MaterialForm material={MATERIAL} families={FAMILIES} />);

    expect(hidden("id")).toHaveValue("ct-verde");
    expect(hidden("family_id")).toHaveValue("catifea");

    const family = screen.getByLabelText(T.family);
    expect(family).toBeDisabled();
    expect(family).not.toHaveAttribute("name");
    expect(family).toHaveValue("catifea");
    expect(family).toHaveAccessibleDescription(T.familyFixed);

    expect(screen.getByText(T.code)).toBeInTheDocument();
    expect(screen.getByText("CT01")).toBeInTheDocument();

    expect(screen.getByLabelText(T.name)).toHaveValue("Verde sticlă");
    expect(screen.getByLabelText(T.hex)).toHaveValue("#2F4B3C");
    expect(screen.getByTestId("hex-preview")).toHaveStyle({ backgroundColor: "#2F4B3C" });
    expect(screen.getByLabelText(T.supplier)).toHaveValue("Textil SRL");
    expect(screen.getByLabelText(T.supplierCode)).toHaveValue("VS-220");
    expect(screen.getByLabelText(T.priceCategory)).toHaveValue("B");
    expect(screen.getByRole("checkbox", { name: T.featured })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: T.active })).toBeChecked();
    expect(screen.getByLabelText(T.sort)).toHaveValue(3);
    expect(hidden(PHOTO_FIELDS.path)).toHaveValue(PHOTO);
    expect(hidden(PHOTO_FIELDS.before)).toHaveValue(PHOTO);

    const remove = screen.getByRole("button", { name: "Șterge materialul" });
    expect(remove).toHaveAttribute("type", "submit");
    expect(remove.className).toContain("border-ink");
    // The delete is its own form, never nested in the edit form.
    expect(remove.closest("form")).not.toBe(screen.getByRole("button", { name: T.submit }).closest("form"));
  });

  it("posts the id and the fixed family, never a code", async () => {
    render(<MaterialForm material={MATERIAL} families={FAMILIES} />);
    fireEvent.change(screen.getByLabelText(T.name), { target: { value: "Verde închis" } });
    fireEvent.click(screen.getByRole("checkbox", { name: T.active }));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(saveMaterial).toHaveBeenCalledTimes(1));
    const formData = saveMaterial.mock.calls[0][1];
    expect(formData.get("id")).toBe("ct-verde");
    expect(formData.getAll("family_id")).toEqual(["catifea"]);
    expect(formData.get("name")).toBe("Verde închis");
    expect(formData.get("active")).toBeNull();
    expect(formData.has("code")).toBe(false);
    expect(formData.get(PHOTO_FIELDS.path)).toBe(PHOTO);
    expect(formData.get(PHOTO_FIELDS.before)).toBe(PHOTO);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(screen.getByLabelText(T.name)).toHaveValue("Verde închis");
  });

  it("shows a plain error without field errors", async () => {
    saveMaterial.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<MaterialForm material={MATERIAL} families={FAMILIES} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText(T.name)).not.toHaveAttribute("aria-invalid");
  });
});

describe("DeleteMaterialButton", () => {
  it("asks for confirmation with the material's name and does nothing when declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MaterialForm material={MATERIAL} families={FAMILIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge materialul" }));

    expect(confirm).toHaveBeenCalledWith(deleteMaterialConfirmText("Verde sticlă"));
    expect(confirm).toHaveBeenCalledWith("Ștergi definitiv materialul Verde sticlă? Dacă e folosit, ștergerea e refuzată.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteMaterial).not.toHaveBeenCalled();
  });

  it("posts the id to the delete action once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MaterialForm material={MATERIAL} families={FAMILIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge materialul" }));

    await waitFor(() => expect(deleteMaterial).toHaveBeenCalledTimes(1));
    expect(deleteMaterial.mock.calls[0][1].get("id")).toBe("ct-verde");
    expect(saveMaterial).not.toHaveBeenCalled();
  });

  it("shows the action's refusal in an alert and keeps the button", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMaterial.mockResolvedValue({ status: "error", message: MATERIAL_MESSAGES.inProject });
    render(<MaterialForm material={MATERIAL} families={FAMILIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge materialul" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(MATERIAL_MESSAGES.inProject);
    expect(alert.className).toContain("border-error");
    expect(screen.getByRole("button", { name: "Șterge materialul" })).toBeEnabled();
  });
});
