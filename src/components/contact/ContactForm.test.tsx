import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_FIELDS, FORM_MESSAGES, type FormState } from "@/lib/leads/types";

// The three Server Actions and the shared schema are replaced: the test drives the form,
// not the pipeline (that has its own tests in src/lib).
const submitContact = vi.fn<(prev: FormState, formData: FormData) => Promise<FormState>>();
const issueFormToken = vi.fn<() => Promise<string>>();
const createUploadUrls = vi.fn();
const parseLeadForm = vi.fn<(formData: FormData) => { ok: true; data: unknown } | { ok: false; fieldErrors: Record<string, string> }>();

vi.mock("@/actions/submit-contact", () => ({ submitContact: (...args: [FormState, FormData]) => submitContact(...args) }));
vi.mock("@/actions/issue-form-token", () => ({ issueFormToken: () => issueFormToken() }));
vi.mock("@/actions/create-upload-urls", () => ({ createUploadUrls: (...args: unknown[]) => createUploadUrls(...args) }));
vi.mock("@/lib/validation/schemas", () => ({
  contactSchema: { kind: "contact" },
  parseLeadForm: (formData: FormData) => parseLeadForm(formData),
}));

import { ContactForm, collectSource } from "./ContactForm";

const EMPTY_ERRORS = {
  name: FORM_MESSAGES.required,
  phone: FORM_MESSAGES.required,
  email: FORM_MESSAGES.required,
  privacy: FORM_MESSAGES.privacy,
};

function fillValid() {
  fireEvent.change(screen.getByLabelText("Nume"), { target: { value: "Ana Pop" } });
  fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "0722 123 456" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Sunt de acord/ }));
}

beforeEach(() => {
  submitContact.mockReset();
  issueFormToken.mockReset();
  createUploadUrls.mockReset();
  parseLeadForm.mockReset();
  issueFormToken.mockResolvedValue("signed-token");
  submitContact.mockResolvedValue({ status: "ok", leadId: "lead-1" });
});

describe("ContactForm", () => {
  it("renders the DESIGN §4.1 09 fields in a form card with the bar", () => {
    render(<ContactForm responseTime="24 de ore" page="/contact" />);
    expect(screen.getByText("Cerere de ofertă")).toBeInTheDocument();
    expect(screen.getByText("Răspuns în 24 de ore")).toBeInTheDocument();

    expect(screen.getByLabelText("Nume")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("type", "tel");
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toBeRequired();

    const select = screen.getByLabelText("Dimensiunea saltelei");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveValue("Încă nu știu");
    expect(screen.getAllByRole("option")).toHaveLength(8);

    expect(screen.getByLabelText("Ce pat îți dorești?")).toHaveAttribute("rows", "4");
    expect(screen.getByLabelText("Poze cu camera sau cu un pat care îți place (opțional)")).toHaveAttribute("type", "file");
    expect(screen.getByRole("checkbox", { name: "Vreau să veniți la măsurători" })).toHaveAttribute("name", "wantsMeasurement");

    const consent = screen.getByRole("checkbox", { name: /Sunt de acord cu prelucrarea datelor/ });
    expect(consent).toHaveAttribute("name", "privacy");
    expect(consent).toBeRequired();
    expect(screen.getByRole("link", { name: "Politicii de confidențialitate" })).toHaveAttribute("href", "/confidentialitate");

    expect(screen.getByRole("button", { name: "Trimite cererea" })).toHaveAttribute("type", "submit");
  });

  it("carries the hidden anti-spam and bookkeeping inputs", () => {
    const { container } = render(<ContactForm responseTime="24 de ore" page="/contact" />);
    const honeypot = container.querySelector<HTMLInputElement>(`input[name="${FORM_FIELDS.honeypot}"]`);
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("autocomplete", "off");
    expect(honeypot!.closest("[aria-hidden='true']")?.className).toContain("sr-only");
    expect(honeypot).toHaveAccessibleName(); // labelled, like every input

    expect(container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`)).toHaveAttribute("type", "hidden");
    const source = container.querySelector<HTMLInputElement>(`input[name="${FORM_FIELDS.source}"]`);
    expect(JSON.parse(source!.value)).toEqual({ page: "/contact" });
    expect(container.querySelector(`input[name="${FORM_FIELDS.uploads}"]`)).toHaveValue("[]");
    // No site key in the test environment: the Turnstile widget and its input stay out.
    expect(container.querySelector(`input[name="${FORM_FIELDS.turnstile}"]`)).toBeNull();
  });

  it("asks for the form token on the first interaction only", async () => {
    const { container } = render(<ContactForm responseTime="24 de ore" page="/" />);
    fireEvent.focus(screen.getByLabelText("Nume"));
    fireEvent.focus(screen.getByLabelText("Telefon"));
    await waitFor(() =>
      expect(container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`)).toHaveValue("signed-token"),
    );
    expect(issueFormToken).toHaveBeenCalledTimes(1);
  });

  it("on an empty submit shows the field errors, focuses the name field and does not call the action", () => {
    parseLeadForm.mockReturnValue({ ok: false, fieldErrors: EMPTY_ERRORS });
    render(<ContactForm responseTime="24 de ore" page="/contact" />);

    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));

    expect(parseLeadForm).toHaveBeenCalledTimes(1);
    expect(submitContact).not.toHaveBeenCalled();

    const name = screen.getByLabelText("Nume");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(FORM_MESSAGES.required);
    expect(name.className).toContain("border-error");
    expect(document.activeElement).toBe(name);

    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    const consent = screen.getByRole("checkbox", { name: /Sunt de acord/ });
    expect(consent).toHaveAttribute("aria-invalid", "true");
    expect(consent).toHaveAccessibleDescription(FORM_MESSAGES.privacy);
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Dimensiunea saltelei")).not.toHaveAttribute("aria-invalid");
  });

  it("posts the source with the page, referrer and utm parameters", () => {
    expect(collectSource("/contact")).toEqual({ page: "/contact" });
    expect(collectSource("/", { search: "?utm_source=insta&utm_medium=bio&x=1" }, "https://instagram.com/")).toEqual({
      page: "/",
      referrer: "https://instagram.com/",
      utm: { utm_source: "insta", utm_medium: "bio" },
    });
  });

  it("on a valid submit calls the action with the form data and shows the confirmation", async () => {
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    render(<ContactForm responseTime="24 de ore" page="/contact" />);
    fillValid();

    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));

    await waitFor(() => expect(submitContact).toHaveBeenCalledTimes(1));
    const formData = submitContact.mock.calls[0][1];
    expect(formData.get("name")).toBe("Ana Pop");
    expect(formData.get("phone")).toBe("0722 123 456");
    expect(formData.get("email")).toBe("ana@example.com");
    expect(formData.get("mattressSize")).toBe("Încă nu știu");
    expect(formData.get("privacy")).toBe("on");
    expect(formData.get("wantsMeasurement")).toBeNull();
    expect(formData.get(FORM_FIELDS.honeypot)).toBe("");
    expect(formData.get(FORM_FIELDS.uploads)).toBe("[]");
    expect(JSON.parse(formData.get(FORM_FIELDS.source) as string)).toMatchObject({ page: "/contact" });

    expect(await screen.findByText("Cerere trimisă")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 3, name: "Mulțumim! Te sunăm în 24 de ore." });
    expect(heading.className).toContain("h3-confirm");
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByText("Între timp, poți să te uiți prin materiale sau să încerci configuratorul."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurator" })).toHaveAttribute("href", "/configurator");
    expect(screen.queryByRole("button", { name: "Trimite cererea" })).toBeNull();

    // „Trimite altă cerere” brings back an empty form.
    fireEvent.click(screen.getByRole("button", { name: "Trimite altă cerere" }));
    expect(screen.getByLabelText("Nume")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Trimite cererea" })).toBeInTheDocument();
    expect(screen.queryByText("Cerere trimisă")).toBeNull();
  });

  it("shows a server error message and the server's field errors", async () => {
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    submitContact.mockResolvedValue({
      status: "error",
      message: FORM_MESSAGES.required,
      fieldErrors: { phone: FORM_MESSAGES.phone },
    });
    render(<ContactForm responseTime="24 de ore" page="/contact" />);
    fillValid();

    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(FORM_MESSAGES.required);
    const phone = screen.getByLabelText("Telefon");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription(FORM_MESSAGES.phone);
    await waitFor(() => expect(document.activeElement).toBe(phone));
    expect(screen.getByRole("button", { name: "Trimite cererea" })).not.toBeDisabled();
  });
});
