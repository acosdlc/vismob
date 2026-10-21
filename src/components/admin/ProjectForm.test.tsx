import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_MESSAGES } from "@/lib/admin/projects";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Actions are replaced: the test drives the form, not the writes (src/actions/admin).
const saveProject = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-project", () => ({
  saveProject: (...args: [AdminActionState, FormData]) => saveProject(...args),
}));
const deleteProject = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/delete-project", () => ({
  deleteProject: (...args: [AdminActionState, FormData]) => deleteProject(...args),
}));

import { DELETE_PROJECT_TEXTS, deleteProjectConfirmText } from "./DeleteProjectButton";
import {
  PROJECT_FORM_TEXTS,
  ProjectForm,
  type ProjectFormBase,
  type ProjectFormFamily,
  type ProjectFormMaterial,
  type ProjectFormModel,
  type ProjectFormProject,
} from "./ProjectForm";

const MODELS: ProjectFormModel[] = [
  { id: "capitonat", name: "Capitonat" },
  { id: "arcuit", name: "Arcuit" },
];
const FAMILIES: ProjectFormFamily[] = [
  { id: "catifea", name: "Catifea" },
  { id: "boucle", name: "Bouclé" },
  { id: "lemn", name: "Lemn masiv" },
];
const MATERIALS: ProjectFormMaterial[] = [
  { id: "ct-verde", name: "Verde sticlă", family_id: "catifea" },
  { id: "ct-nisip", name: "Nisip", family_id: "catifea" },
  { id: "bc-alb", name: "Alb", family_id: "boucle" },
];
const BASES: ProjectFormBase[] = [
  { id: "lemn", name: "Picioare din lemn" },
  { id: "lada", name: "Ladă de depozitare" },
];

const PROJECT: ProjectFormProject = {
  id: "9a1b2c3d-0000-4000-8000-00000000abcd",
  title: "Pat capitonat pentru un dormitor mic",
  ticket_no: "0412",
  model_id: "arcuit",
  width_cm: 160,
  length_cm: 200,
  material_id: "bc-alb",
  base_id: "lada",
  extras: ["2 noptiere"],
  city: "Cluj-Napoca",
  delivered_on: "2026-03-14",
  featured: true,
  hero: false,
  published: true,
  client_consent: true,
  sort: 3,
};

const T = PROJECT_FORM_TEXTS;
const lists = { models: MODELS, materials: MATERIALS, families: FAMILIES, bases: BASES };

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
}

beforeEach(() => {
  saveProject.mockReset();
  saveProject.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
  deleteProject.mockReset();
  // On success the real action redirects; here it simply resolves to the idle state.
  deleteProject.mockResolvedValue({ status: "idle" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjectForm for a new project", () => {
  it("renders a labelled control for every column, with the defaults, in two sections, and no delete", () => {
    render(<ProjectForm project={null} {...lists} />);

    expect(screen.getByRole("heading", { level: 2, name: T.sectionProject })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: T.sectionPublish })).toBeInTheDocument();
    expect(hidden("id")).toHaveValue("");

    const title = screen.getByLabelText(T.title);
    expect(title).toHaveAttribute("name", "title");
    expect(title).toHaveAttribute("maxlength", "120");
    expect(title).toHaveValue("");
    expect(title).toHaveAccessibleDescription(T.titleHint);

    const ticket = screen.getByLabelText(T.ticketNo);
    expect(ticket).toHaveAttribute("name", "ticket_no");
    expect(ticket).toHaveAttribute("maxlength", "20");
    expect(ticket).toHaveAccessibleDescription(T.ticketNoHint);

    const model = screen.getByLabelText(T.model);
    expect(model.tagName).toBe("SELECT");
    expect(model).toHaveAttribute("name", "model_id");
    expect(model).toHaveValue("capitonat");
    expect(Array.from(model.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Capitonat", "Arcuit"]);

    const width = screen.getByLabelText(T.width);
    expect(width).toHaveAttribute("name", "width_cm");
    expect(width).toHaveAttribute("type", "number");
    expect(width).toHaveAttribute("min", "60");
    expect(width).toHaveAttribute("max", "300");
    expect(width).toHaveValue(null);
    const length = screen.getByLabelText(T.length);
    expect(length).toHaveAttribute("name", "length_cm");
    expect(length).toHaveValue(null);

    const material = screen.getByLabelText(T.material);
    expect(material.tagName).toBe("SELECT");
    expect(material).toHaveAttribute("name", "material_id");
    expect(material).toHaveValue("");
    expect(Array.from(material.querySelectorAll("optgroup")).map((g) => g.getAttribute("label"))).toEqual(["Catifea", "Bouclé"]);
    expect(Array.from(material.querySelectorAll("option")).map((o) => [o.getAttribute("value"), o.textContent])).toEqual([
      ["", "—"],
      ["ct-verde", "Verde sticlă"],
      ["ct-nisip", "Nisip"],
      ["bc-alb", "Alb"],
    ]);

    const base = screen.getByLabelText(T.base);
    expect(base).toHaveAttribute("name", "base_id");
    expect(base).toHaveValue("");
    expect(Array.from(base.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["—", "Picioare din lemn", "Ladă de depozitare"]);

    expect(screen.getByRole("group", { name: T.extras })).toBeInTheDocument();
    const led = screen.getByRole("checkbox", { name: "LED sub pat" });
    expect(led).toHaveAttribute("name", "extras");
    expect(led).toHaveAttribute("value", "led");
    expect(led).not.toBeChecked();
    const nightstands = screen.getByRole("checkbox", { name: "2 noptiere" });
    expect(nightstands).toHaveAttribute("name", "extras");
    expect(nightstands).toHaveAttribute("value", "nightstands");
    expect(nightstands).not.toBeChecked();

    expect(screen.getByLabelText(T.city)).toHaveAttribute("name", "city");
    expect(screen.getByLabelText(T.city)).toHaveAttribute("maxlength", "80");
    const delivered = screen.getByLabelText(T.deliveredOn);
    expect(delivered).toHaveAttribute("name", "delivered_on");
    expect(delivered).toHaveAttribute("type", "date");
    expect(delivered).toHaveValue("");
    expect(delivered).toHaveAccessibleDescription(T.deliveredOnHint);

    for (const [label, name] of [
      [T.clientConsent, "client_consent"],
      [T.published, "published"],
      [T.featured, "featured"],
      [T.hero, "hero"],
    ]) {
      const box = screen.getByRole("checkbox", { name: label });
      expect(box).toHaveAttribute("name", name);
      expect(box).not.toBeChecked();
    }
    const sort = screen.getByLabelText(T.sort);
    expect(sort).toHaveAttribute("name", "sort");
    expect(sort).toHaveValue(0);

    const submit = screen.getByRole("button", { name: T.submit });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeEnabled();
    expect(screen.queryByRole("button", { name: DELETE_PROJECT_TEXTS.submit })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("posts every field to the action, the extras as repeated values, keeps the typed values and shows the notice", async () => {
    render(<ProjectForm project={null} {...lists} />);
    fireEvent.change(screen.getByLabelText(T.title), { target: { value: "Pat arcuit, mansardă" } });
    fireEvent.change(screen.getByLabelText(T.ticketNo), { target: { value: "0413" } });
    fireEvent.change(screen.getByLabelText(T.model), { target: { value: "arcuit" } });
    fireEvent.change(screen.getByLabelText(T.width), { target: { value: "140" } });
    fireEvent.change(screen.getByLabelText(T.length), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText(T.material), { target: { value: "ct-nisip" } });
    fireEvent.change(screen.getByLabelText(T.base), { target: { value: "lemn" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "LED sub pat" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "2 noptiere" }));
    fireEvent.change(screen.getByLabelText(T.city), { target: { value: "Brașov" } });
    fireEvent.change(screen.getByLabelText(T.deliveredOn), { target: { value: "2026-05-02" } });
    fireEvent.click(screen.getByRole("checkbox", { name: T.clientConsent }));
    fireEvent.click(screen.getByRole("checkbox", { name: T.published }));
    fireEvent.change(screen.getByLabelText(T.sort), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const formData = saveProject.mock.calls[0][1];
    expect(formData.get("id")).toBe("");
    expect(formData.get("title")).toBe("Pat arcuit, mansardă");
    expect(formData.get("ticket_no")).toBe("0413");
    expect(formData.get("model_id")).toBe("arcuit");
    expect(formData.get("width_cm")).toBe("140");
    expect(formData.get("length_cm")).toBe("200");
    expect(formData.get("material_id")).toBe("ct-nisip");
    expect(formData.get("base_id")).toBe("lemn");
    expect(formData.getAll("extras")).toEqual(["led", "nightstands"]);
    expect(formData.get("city")).toBe("Brașov");
    expect(formData.get("delivered_on")).toBe("2026-05-02");
    expect(formData.get("client_consent")).toBe("on");
    expect(formData.get("published")).toBe("on");
    expect(formData.get("featured")).toBeNull();
    expect(formData.get("hero")).toBeNull();
    expect(formData.get("sort")).toBe("5");
    expect(formData.has("slug")).toBe(false);

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(screen.getByLabelText(T.title)).toHaveValue("Pat arcuit, mansardă");
    expect(screen.getByLabelText(T.model)).toHaveValue("arcuit");
    expect(screen.getByRole("checkbox", { name: "LED sub pat" })).toBeChecked();
    expect(screen.getByRole("button", { name: T.submit })).toBeEnabled();
  });

  it("shows the server's message and field errors, and focuses the first invalid field in form order", async () => {
    saveProject.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { width_cm: PROJECT_MESSAGES.size, title: ADMIN_MESSAGES.required, model_id: PROJECT_MESSAGES.model, extras: ADMIN_MESSAGES.invalid },
    });
    render(<ProjectForm project={null} {...lists} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");

    const title = screen.getByLabelText(T.title);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(`${T.titleHint} ${ADMIN_MESSAGES.required}`);
    expect(screen.getByLabelText(T.model)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(T.model)).toHaveAccessibleDescription(PROJECT_MESSAGES.model);
    expect(screen.getByLabelText(T.width)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(T.width)).toHaveAccessibleDescription(PROJECT_MESSAGES.size);
    expect(screen.getByRole("checkbox", { name: "LED sub pat" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(T.length)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText(T.city)).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it("marks the published box when the server refuses publishing without consent, and the hero box for an unpublished hero", async () => {
    saveProject.mockResolvedValue({ status: "error", message: PROJECT_MESSAGES.consent, fieldErrors: { published: PROJECT_MESSAGES.consent } });
    const { unmount } = render(<ProjectForm project={null} {...lists} />);
    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(PROJECT_MESSAGES.consent);
    const published = screen.getByRole("checkbox", { name: T.published });
    expect(published).toHaveAttribute("aria-invalid", "true");
    expect(published).toHaveAccessibleDescription(PROJECT_MESSAGES.consent);
    await waitFor(() => expect(document.activeElement).toBe(published));
    unmount();

    saveProject.mockResolvedValue({
      status: "error",
      message: PROJECT_MESSAGES.heroUnpublished,
      fieldErrors: { hero: PROJECT_MESSAGES.heroUnpublished },
    });
    render(<ProjectForm project={null} {...lists} />);
    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(PROJECT_MESSAGES.heroUnpublished);
    const hero = screen.getByRole("checkbox", { name: T.hero });
    expect(hero).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(document.activeElement).toBe(hero));
  });

  it("shows a plain error without field errors", async () => {
    saveProject.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<ProjectForm project={null} {...lists} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText(T.title)).not.toHaveAttribute("aria-invalid");
  });
});

describe("ProjectForm for an existing project", () => {
  it("fills the values, ticks the stored extras by their labels and offers the delete in its own form", () => {
    render(<ProjectForm project={PROJECT} {...lists} />);

    expect(hidden("id")).toHaveValue(PROJECT.id);
    expect(screen.getByLabelText(T.title)).toHaveValue("Pat capitonat pentru un dormitor mic");
    expect(screen.getByLabelText(T.ticketNo)).toHaveValue("0412");
    expect(screen.getByLabelText(T.model)).toHaveValue("arcuit");
    expect(screen.getByLabelText(T.width)).toHaveValue(160);
    expect(screen.getByLabelText(T.length)).toHaveValue(200);
    expect(screen.getByLabelText(T.material)).toHaveValue("bc-alb");
    expect(screen.getByLabelText(T.base)).toHaveValue("lada");
    expect(screen.getByRole("checkbox", { name: "LED sub pat" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "2 noptiere" })).toBeChecked();
    expect(screen.getByLabelText(T.city)).toHaveValue("Cluj-Napoca");
    expect(screen.getByLabelText(T.deliveredOn)).toHaveValue("2026-03-14");
    expect(screen.getByRole("checkbox", { name: T.clientConsent })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: T.published })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: T.featured })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: T.hero })).not.toBeChecked();
    expect(screen.getByLabelText(T.sort)).toHaveValue(3);

    const remove = screen.getByRole("button", { name: DELETE_PROJECT_TEXTS.submit });
    expect(remove).toHaveAttribute("type", "submit");
    expect(remove.className).toContain("border-ink");
    // The delete is its own form, never nested in the edit form.
    expect(remove.closest("form")).not.toBe(screen.getByRole("button", { name: T.submit }).closest("form"));
  });

  it("renders the null columns as empty controls", () => {
    render(
      <ProjectForm
        project={{ ...PROJECT, ticket_no: null, model_id: null, width_cm: null, length_cm: null, material_id: null, base_id: null, city: null, delivered_on: null, extras: [] }}
        {...lists}
      />,
    );
    expect(screen.getByLabelText(T.ticketNo)).toHaveValue("");
    expect(screen.getByLabelText(T.model)).toHaveValue("capitonat");
    expect(screen.getByLabelText(T.width)).toHaveValue(null);
    expect(screen.getByLabelText(T.material)).toHaveValue("");
    expect(screen.getByLabelText(T.base)).toHaveValue("");
    expect(screen.getByLabelText(T.city)).toHaveValue("");
    expect(screen.getByLabelText(T.deliveredOn)).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "2 noptiere" })).not.toBeChecked();
  });

  it("posts the id with the edited values", async () => {
    render(<ProjectForm project={PROJECT} {...lists} />);
    fireEvent.change(screen.getByLabelText(T.title), { target: { value: "Pat arcuit" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "2 noptiere" }));
    fireEvent.click(screen.getByRole("checkbox", { name: T.hero }));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const formData = saveProject.mock.calls[0][1];
    expect(formData.get("id")).toBe(PROJECT.id);
    expect(formData.get("title")).toBe("Pat arcuit");
    expect(formData.getAll("extras")).toEqual([]);
    expect(formData.get("hero")).toBe("on");
    expect(formData.get("featured")).toBe("on");
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(screen.getByLabelText(T.title)).toHaveValue("Pat arcuit");
  });
});

describe("DeleteProjectButton", () => {
  it("asks for confirmation with the project's title and does nothing when declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProjectForm project={PROJECT} {...lists} />);

    fireEvent.click(screen.getByRole("button", { name: DELETE_PROJECT_TEXTS.submit }));

    expect(confirm).toHaveBeenCalledWith(deleteProjectConfirmText(PROJECT.title));
    expect(confirm).toHaveBeenCalledWith("Ștergi definitiv proiectul „Pat capitonat pentru un dormitor mic” și pozele lui?");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("posts the id to the delete action once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProjectForm project={PROJECT} {...lists} />);

    fireEvent.click(screen.getByRole("button", { name: DELETE_PROJECT_TEXTS.submit }));

    await waitFor(() => expect(deleteProject).toHaveBeenCalledTimes(1));
    expect(deleteProject.mock.calls[0][1].get("id")).toBe(PROJECT.id);
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("shows the action's error in an alert and keeps the button", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteProject.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<ProjectForm project={PROJECT} {...lists} />);

    fireEvent.click(screen.getByRole("button", { name: DELETE_PROJECT_TEXTS.submit }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(alert.className).toContain("border-error");
    expect(screen.getByRole("button", { name: DELETE_PROJECT_TEXTS.submit })).toBeEnabled();
  });
});
