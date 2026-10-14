import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_FIELDS, FORM_MESSAGES, type FormState } from "@/lib/leads/types";
import { deliveryNote, SamplesForm } from "./SamplesForm";
import { SAMPLES_FIELDS, type MaterialsSettings, type SampleBoxApi, type SampleItem } from "./types";

// The two Server Actions are replaced: the test drives the form with the real Zod pre-pass,
// not the pipeline (src/actions/submit-samples.test.ts covers that).
const submitSamples = vi.fn<(prev: FormState, formData: FormData) => Promise<FormState>>();
const issueFormToken = vi.fn<() => Promise<string>>();
vi.mock("@/actions/submit-samples", () => ({ submitSamples: (...args: [FormState, FormData]) => submitSamples(...args) }));
vi.mock("@/actions/issue-form-token", () => ({ issueFormToken: () => issueFormToken() }));

const SETTINGS: MaterialsSettings = {
  sample_limit: 5,
  samples_free: "[gratuit]",
  samples_delivery: "[2–3 zile lucrătoare]",
  leg_height_cm: "[12]",
  oil_refresh_interval: "[o dată pe an]",
};

const ITEMS: SampleItem[] = [
  { id: "ct-verde", name: "Verde sticlă", code: "CT01", hex: "#2F4B3C", familyId: "catifea", familyName: "Catifea" },
  { id: "bc-nisip", name: "Nisip", code: "BC02", hex: "#CDBFA6", familyId: "boucle", familyName: "Bouclé" },
];

function fakeBox(ids: string[]): SampleBoxApi {
  return {
    ids,
    limit: 5,
    isFull: ids.length >= 5,
    hydrated: true,
    has: (id) => ids.includes(id),
    add: vi.fn(() => false),
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

function setup(ids: string[] = ITEMS.map((i) => i.id), onSent = vi.fn()) {
  const items = ITEMS.filter((i) => ids.includes(i.id));
  const view = render(<SamplesForm items={items} box={fakeBox(ids)} settings={SETTINGS} onSent={onSent} />);
  return { ...view, onSent };
}

function fillValid() {
  fireEvent.change(screen.getByLabelText("Nume"), { target: { value: "Ana Pop" } });
  fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "0722 123 456" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
  fireEvent.change(screen.getByLabelText("Adresa de livrare"), { target: { value: "Str. Lungă 1, Cluj" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Sunt de acord/ }));
}

const hiddenIds = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>(`input[name="${SAMPLES_FIELDS.ids}"]`);

beforeEach(() => {
  submitSamples.mockReset();
  issueFormToken.mockReset();
  issueFormToken.mockResolvedValue("signed-token");
  submitSamples.mockResolvedValue({ status: "ok", leadId: "lead-1" });
});

describe("SamplesForm", () => {
  it("renders the DESIGN §4.3 fields, the consent, the hidden ids and the delivery note", () => {
    const { container } = setup();

    expect(screen.getByLabelText("Nume")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("type", "tel");
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toBeRequired();
    const address = screen.getByLabelText("Adresa de livrare");
    expect(address.tagName).toBe("TEXTAREA");
    expect(address).toHaveAttribute("name", "address");
    expect(address).toHaveAttribute("rows", "2");
    expect(address).toBeRequired();
    const consent = screen.getByRole("checkbox", { name: /Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate\./ });
    expect(consent).toHaveAttribute("name", "privacy");
    expect(screen.getByRole("link", { name: "Politicii de confidențialitate" })).toHaveAttribute("href", "/confidentialitate");

    const submit = screen.getByRole("button", { name: "Trimite-mi mostrele" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).not.toBeDisabled();
    expect(screen.getByText("Livrare prin curier în [2–3 zile lucrătoare]. [Gratuit].")).toBeInTheDocument();

    const ids = hiddenIds(container);
    expect(ids).toHaveAttribute("type", "hidden");
    expect(JSON.parse(ids!.value)).toEqual(["ct-verde", "bc-nisip"]);

    // Anti-spam and bookkeeping, as on the other forms.
    expect(container.querySelector(`input[name="${FORM_FIELDS.honeypot}"]`)).toHaveAttribute("tabindex", "-1");
    expect(container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`)).toHaveAttribute("type", "hidden");
    const source = container.querySelector<HTMLInputElement>(`input[name="${FORM_FIELDS.source}"]`);
    expect(JSON.parse(source!.value)).toEqual({ page: "/materiale" });
    // The form sits in the box under a dashed rule, not in a FormCard.
    expect(container.querySelector("form")?.className).toContain("border-dashed");
  });

  it("follows the box in the hidden input and disables the submit while the box is empty", () => {
    const { container, rerender } = setup([]);
    expect(JSON.parse(hiddenIds(container)!.value)).toEqual([]);
    expect(screen.getByRole("button", { name: "Trimite-mi mostrele" })).toBeDisabled();

    rerender(<SamplesForm items={[ITEMS[1]]} box={fakeBox(["bc-nisip"])} settings={SETTINGS} onSent={vi.fn()} />);
    expect(JSON.parse(hiddenIds(container)!.value)).toEqual(["bc-nisip"]);
    expect(screen.getByRole("button", { name: "Trimite-mi mostrele" })).not.toBeDisabled();
  });

  it("asks for the form token on the first interaction only", async () => {
    const { container } = setup();
    fireEvent.focus(screen.getByLabelText("Nume"));
    fireEvent.focus(screen.getByLabelText("Telefon"));
    await waitFor(() =>
      expect(container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`)).toHaveValue("signed-token"),
    );
    expect(issueFormToken).toHaveBeenCalledTimes(1);
  });

  it("on an empty submit shows the field errors, focuses the name and does not call the action", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Trimite-mi mostrele" }));

    expect(submitSamples).not.toHaveBeenCalled();
    const name = screen.getByLabelText("Nume");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(FORM_MESSAGES.required);
    expect(document.activeElement).toBe(name);
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    const address = screen.getByLabelText("Adresa de livrare");
    expect(address).toHaveAttribute("aria-invalid", "true");
    expect(address).toHaveAccessibleDescription(FORM_MESSAGES.required);
    expect(screen.getByRole("checkbox", { name: /Sunt de acord/ })).toHaveAccessibleDescription(FORM_MESSAGES.privacy);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("on a valid submit posts the fields and the ids, then calls onSent", async () => {
    const onSent = vi.fn();
    setup(undefined, onSent);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite-mi mostrele" }));

    await waitFor(() => expect(submitSamples).toHaveBeenCalledTimes(1));
    const formData = submitSamples.mock.calls[0][1];
    expect(formData.get("name")).toBe("Ana Pop");
    expect(formData.get("phone")).toBe("0722 123 456");
    expect(formData.get("email")).toBe("ana@example.com");
    expect(formData.get("address")).toBe("Str. Lungă 1, Cluj");
    expect(formData.get("privacy")).toBe("on");
    expect(JSON.parse(formData.get(SAMPLES_FIELDS.ids) as string)).toEqual(["ct-verde", "bc-nisip"]);
    expect(formData.get(FORM_FIELDS.honeypot)).toBe("");
    expect(JSON.parse(formData.get(FORM_FIELDS.source) as string)).toMatchObject({ page: "/materiale" });

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });

  it("shows a server error message, the field errors and the ids' error", async () => {
    submitSamples.mockResolvedValue({
      status: "error",
      message: FORM_MESSAGES.required,
      fieldErrors: { phone: FORM_MESSAGES.phone, [SAMPLES_FIELDS.ids]: FORM_MESSAGES.samples },
    });
    const { onSent } = setup();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite-mi mostrele" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual([FORM_MESSAGES.samples, FORM_MESSAGES.required]);
    const phone = screen.getByLabelText("Telefon");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription(FORM_MESSAGES.phone);
    await waitFor(() => expect(document.activeElement).toBe(phone));
    expect(screen.getByRole("button", { name: "Trimite-mi mostrele" })).not.toBeDisabled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it("builds the delivery note from the settings", () => {
    expect(deliveryNote(SETTINGS)).toBe("Livrare prin curier în [2–3 zile lucrătoare]. [Gratuit].");
    expect(deliveryNote({ samples_delivery: "2–3 zile lucrătoare", samples_free: "gratuit" })).toBe(
      "Livrare prin curier în 2–3 zile lucrătoare. Gratuit.",
    );
  });
});
