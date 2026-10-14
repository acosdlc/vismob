import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/configurator/catalog.seed";
import { paramsFromConfig } from "@/lib/configurator/url";
import { FORM_FIELDS, FORM_MESSAGES, type FormState } from "@/lib/leads/types";
import { QUOTE_FIELDS } from "./types";

// The two Server Actions are replaced: the test drives the form with the real Zod pre-pass,
// not the pipeline (src/actions/submit-quote.test.ts covers that).
const submitQuote = vi.fn<(prev: FormState, formData: FormData) => Promise<FormState>>();
const issueFormToken = vi.fn<() => Promise<string>>();
vi.mock("@/actions/submit-quote", () => ({ submitQuote: (...args: [FormState, FormData]) => submitQuote(...args) }));
vi.mock("@/actions/issue-form-token", () => ({ issueFormToken: () => issueFormToken() }));
// ContactForm (collectSource, focusFirstInvalid) imports the contact actions, which are server-only.
vi.mock("@/actions/submit-contact", () => ({ submitContact: vi.fn() }));
vi.mock("@/actions/create-upload-urls", () => ({ createUploadUrls: vi.fn() }));

import { QuoteForm } from "./QuoteForm";
import { QuoteSection } from "./QuoteSection";

const CODE = "CAP-160x200-CT01-H120-PL";
const CUSTOM = { ...DEFAULT_CONFIG, size: "custom" as const, customW: 150, customL: 210, led: true };

function fillValid() {
  fireEvent.change(screen.getByLabelText("Nume"), { target: { value: "Ana Pop" } });
  fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "0722 123 456" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Sunt de acord/ }));
}

const hiddenConfig = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>(`input[name="${QUOTE_FIELDS.config}"]`);

beforeEach(() => {
  submitQuote.mockReset();
  issueFormToken.mockReset();
  issueFormToken.mockResolvedValue("signed-token");
  submitQuote.mockResolvedValue({ status: "ok", leadId: "lead-1", code: CODE });
});

describe("QuoteSection", () => {
  it("renders section 07 with the heading, the three steps and the form", () => {
    render(<QuoteSection config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);
    const section = document.getElementById("cerere");
    expect(section?.tagName).toBe("SECTION");
    expect(screen.getByRole("heading", { level: 2, name: "Primești oferta finală după o discuție scurtă." })).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toEqual([
      "01Te sunăm în 24 de ore să clarificăm detaliile.",
      "02Venim la măsurători sau confirmăm dimensiunile cu tine.",
      "03Primești desenul final și prețul, în scris.",
    ]);
    expect(screen.getByRole("button", { name: "Trimite configurația" })).toBeInTheDocument();
  });
});

describe("QuoteForm", () => {
  it("renders the DESIGN §4.2 fields, the attached code box and the hidden configuration", () => {
    const { container } = render(<QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);

    expect(screen.getByText("Configurația atașată")).toBeInTheDocument();
    expect(screen.getByTestId("attached-code")).toHaveTextContent(CODE);

    expect(screen.getByLabelText("Nume")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("type", "tel");
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toBeRequired();
    expect(screen.getByLabelText("Localitate")).toHaveAttribute("name", "city");
    const details = screen.getByLabelText("Detalii (opțional)");
    expect(details).toHaveAttribute("name", "message");
    expect(details).toHaveAttribute("rows", "3");
    expect(screen.getByRole("checkbox", { name: "Vreau să veniți la măsurători" })).toHaveAttribute("name", "wantsMeasurement");
    const consent = screen.getByRole("checkbox", { name: /Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate\./ });
    expect(consent).toHaveAttribute("name", "privacy");
    expect(consent).toBeRequired();
    expect(screen.getByRole("link", { name: "Politicii de confidențialitate" })).toHaveAttribute("href", "/confidentialitate");
    expect(screen.getByRole("button", { name: "Trimite configurația" })).toHaveAttribute("type", "submit");

    const config = hiddenConfig(container);
    expect(config).toHaveAttribute("type", "hidden");
    expect(config).toHaveValue(paramsFromConfig(DEFAULT_CONFIG).toString());

    // Anti-spam and bookkeeping, as on the contact form.
    expect(container.querySelector(`input[name="${FORM_FIELDS.honeypot}"]`)).toHaveAttribute("tabindex", "-1");
    expect(container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`)).toHaveAttribute("type", "hidden");
    const source = container.querySelector<HTMLInputElement>(`input[name="${FORM_FIELDS.source}"]`);
    expect(JSON.parse(source!.value)).toEqual({ page: "/configurator" });
  });

  it("follows the configuration prop in the hidden input and the box", () => {
    const { container, rerender } = render(<QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);
    rerender(<QuoteForm config={CUSTOM} code="CAP-150x210-CT01-H120-PL-LED" responseTime="24 de ore" />);
    expect(hiddenConfig(container)).toHaveValue(paramsFromConfig(CUSTOM).toString());
    expect(hiddenConfig(container)!.value).toContain("w=150&l=210&led=1");
    expect(screen.getByTestId("attached-code")).toHaveTextContent("CAP-150x210-CT01-H120-PL-LED");
  });

  it("asks for the form token on the first interaction only", async () => {
    const { container } = render(<QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);
    fireEvent.focus(screen.getByLabelText("Nume"));
    fireEvent.focus(screen.getByLabelText("Telefon"));
    await waitFor(() =>
      expect(container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`)).toHaveValue("signed-token"),
    );
    expect(issueFormToken).toHaveBeenCalledTimes(1);
  });

  it("on an empty submit shows the field errors, focuses the name and does not call the action", () => {
    render(<QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));

    expect(submitQuote).not.toHaveBeenCalled();
    const name = screen.getByLabelText("Nume");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(FORM_MESSAGES.required);
    expect(document.activeElement).toBe(name);
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("checkbox", { name: /Sunt de acord/ })).toHaveAccessibleDescription(FORM_MESSAGES.privacy);
    expect(screen.getByLabelText("Localitate")).not.toHaveAttribute("aria-invalid");
  });

  it("on a valid submit calls the action with the configuration and shows the server's code", async () => {
    submitQuote.mockResolvedValue({ status: "ok", leadId: "lead-1", code: "CAP-150x210-CT01-H120-PL-LED" });
    render(<QuoteForm config={CUSTOM} code="client-code" responseTime="24 de ore" />);
    fillValid();
    fireEvent.change(screen.getByLabelText("Localitate"), { target: { value: "Cluj" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Vreau să veniți la măsurători" }));

    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));

    await waitFor(() => expect(submitQuote).toHaveBeenCalledTimes(1));
    const formData = submitQuote.mock.calls[0][1];
    expect(formData.get(QUOTE_FIELDS.config)).toBe(paramsFromConfig(CUSTOM).toString());
    expect(formData.get("name")).toBe("Ana Pop");
    expect(formData.get("city")).toBe("Cluj");
    expect(formData.get("wantsMeasurement")).toBe("on");
    expect(formData.get("privacy")).toBe("on");
    expect(formData.get(FORM_FIELDS.honeypot)).toBe("");
    expect(JSON.parse(formData.get(FORM_FIELDS.source) as string)).toMatchObject({ page: "/configurator" });

    // The confirmation carries the code the server recomputed, not the client's.
    expect(await screen.findByText("Configurație trimisă · CAP-150x210-CT01-H120-PL-LED")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 3, name: "Mulțumim! Te sunăm în 24 de ore." });
    expect(heading.className).toContain("h3-confirm");
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByText(
        "Am primit desenul și alegerile tale. Dacă vrei să vezi materialele înainte, cere mostrele acum și le primești odată cu oferta.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cere mostre" })).toHaveAttribute("href", "/materiale");
    expect(screen.queryByRole("button", { name: "Trimite configurația" })).toBeNull();
  });

  it("„Modifică configurația” brings the form back with the same configuration", async () => {
    const { container } = render(<QuoteForm config={CUSTOM} code="CAP-150x210-CT01-H120-PL-LED" responseTime="24 de ore" />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));
    await screen.findByRole("button", { name: "Modifică configurația" });

    fireEvent.click(screen.getByRole("button", { name: "Modifică configurația" }));

    expect(screen.getByRole("button", { name: "Trimite configurația" })).toBeInTheDocument();
    expect(screen.queryByText(/Configurație trimisă/)).toBeNull();
    expect(hiddenConfig(container)).toHaveValue(paramsFromConfig(CUSTOM).toString());
    expect(screen.getByTestId("attached-code")).toHaveTextContent("CAP-150x210-CT01-H120-PL-LED");
    expect(screen.getByLabelText("Nume")).toHaveValue("");
  });

  it("shows a server error message and the server's field errors", async () => {
    submitQuote.mockResolvedValue({
      status: "error",
      message: FORM_MESSAGES.required,
      fieldErrors: { phone: FORM_MESSAGES.phone },
    });
    render(<QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(FORM_MESSAGES.required);
    const phone = screen.getByLabelText("Telefon");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription(FORM_MESSAGES.phone);
    await waitFor(() => expect(document.activeElement).toBe(phone));
    expect(screen.getByRole("button", { name: "Trimite configurația" })).not.toBeDisabled();
  });
});
