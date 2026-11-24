import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Activity, Component, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
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
// The analytics script is not injected in tests; the mock records the calls (ARHITECTURA §10).
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { QuoteForm } from "./QuoteForm";
import { QuoteSection } from "./QuoteSection";

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

/**
 * The page as the router holds it (`cacheComponents`, layout-router.js): inside an Activity
 * that is hidden while the visitor is on another page and shown again when she returns.
 * State and DOM are kept; the effects are cleaned up and run again. The link stands for
 * the site's menu, outside the kept page.
 */
function KeptPage({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <>
      <a href="/lucrari">Lucrări</a>
      <Activity mode={shown ? "visible" : "hidden"}>{children}</Activity>
    </>
  );
}

const tracked = vi.mocked(track);

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
  tracked.mockReset();
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

  it("asks for the form token again after a call that brought no answer, until one does, and posts it", async () => {
    // The visitor's connection was away at her first touches of the form.
    issueFormToken.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);
    const startedAt = container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`);

    fireEvent.focus(screen.getByLabelText("Nume"));
    await act(async () => {}); // the rejection arrives
    expect(issueFormToken).toHaveBeenCalledTimes(1);
    expect(startedAt).toHaveValue("");

    // The next pointer-down asks again, and so does the next focus after that one failed too.
    fireEvent.pointerDown(screen.getByLabelText("Telefon"));
    expect(issueFormToken).toHaveBeenCalledTimes(2);
    await act(async () => {});
    expect(startedAt).toHaveValue("");
    fireEvent.focus(screen.getByLabelText("Telefon"));
    expect(issueFormToken).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(startedAt).toHaveValue("signed-token"));

    // With the token in hand nothing asks any more, and the submit carries it.
    fillValid();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Trimite configurația" }));
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));
    await waitFor(() => expect(submitQuote).toHaveBeenCalledTimes(1));
    expect(submitQuote.mock.calls[0][1].get(FORM_FIELDS.startedAt)).toBe("signed-token");
    expect(issueFormToken).toHaveBeenCalledTimes(3);
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
    expect(tracked).not.toHaveBeenCalled();
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
    // The focus and the event come from an effect, a moment after the confirmation is on screen.
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText("Am primit desenul și alegerile tale.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cere mostre" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Trimite configurația" })).toBeNull();

    // quote_submit once, with the server's code; a later configuration change does not repeat it.
    await waitFor(() => expect(tracked).toHaveBeenCalledTimes(1));
    expect(tracked).toHaveBeenCalledWith("quote_submit", { code: "CAP-150x210-CT01-H120-PL-LED" });
  });

  it("reports quote_submit once per success, not again when the configuration prop changes", async () => {
    const view = render(<QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));
    await screen.findByText(`Configurație trimisă · ${CODE}`);
    await waitFor(() => expect(tracked.mock.calls).toEqual([["quote_submit", { code: CODE }]]));

    view.rerender(<QuoteForm config={CUSTOM} code="CAP-150x210-CT01-H120-PL-LED" responseTime="24 de ore" />);
    expect(tracked).toHaveBeenCalledTimes(1);
  });

  it("reports quote_submit once and leaves the focus where it is when the router shows the kept page again", async () => {
    const page = (shown: boolean) => (
      <KeptPage shown={shown}>
        <QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />
      </KeptPage>
    );
    const view = render(page(true));
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));
    const heading = await screen.findByRole("heading", { name: "Mulțumim! Te sunăm în 24 de ore." });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await waitFor(() => expect(tracked).toHaveBeenCalledTimes(1));

    // She leaves through the menu and comes back, twice: each time the router hides the
    // page, then shows it as she left it, on the confirmation.
    const menu = screen.getByRole("link", { name: "Lucrări" });
    for (let visit = 1; visit <= 2; visit++) {
      view.rerender(page(false));
      act(() => menu.focus());
      view.rerender(page(true));

      expect(screen.getByRole("heading", { name: "Mulțumim! Te sunăm în 24 de ore." })).toBe(heading);
      // One request is one conversion, however often its confirmation is seen.
      expect(tracked).toHaveBeenCalledTimes(1);
      // The focus, and the scroll with it, is not pulled back to the confirmation.
      expect(document.activeElement).toBe(menu);
    }
  });

  it("„Modifică configurația” brings the form back with the same configuration", async () => {
    const { container } = render(<QuoteForm config={CUSTOM} code="CAP-150x210-CT01-H120-PL-LED" responseTime="24 de ore" />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));
    await screen.findByRole("button", { name: "Modifică configurația" });
    const first = screen.getByRole("heading", { level: 3, name: "Mulțumim! Te sunăm în 24 de ore." });

    fireEvent.click(screen.getByRole("button", { name: "Modifică configurația" }));

    expect(screen.getByRole("button", { name: "Trimite configurația" })).toBeInTheDocument();
    expect(screen.queryByText(/Configurație trimisă/)).toBeNull();
    expect(hiddenConfig(container)).toHaveValue(paramsFromConfig(CUSTOM).toString());
    expect(screen.getByTestId("attached-code")).toHaveTextContent("CAP-150x210-CT01-H120-PL-LED");
    expect(screen.getByLabelText("Nume")).toHaveValue("");

    // A second request from the remounted form is a second quote_submit, and its
    // confirmation takes the focus as the first one did.
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));
    await screen.findByRole("button", { name: "Modifică configurația" });
    await waitFor(() =>
      expect(tracked.mock.calls).toEqual([
        ["quote_submit", { code: CODE }],
        ["quote_submit", { code: CODE }],
      ]),
    );
    const second = screen.getByRole("heading", { level: 3, name: "Mulțumim! Te sunăm în 24 de ore." });
    expect(second).not.toBe(first);
    expect(document.activeElement).toBe(second);
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
    expect(tracked).not.toHaveBeenCalled();
  });

  it("keeps the form, what was typed and the configuration when the call to the action fails, and sends on the next try", async () => {
    // No answer comes back: the visitor's connection dropped for a moment. (After a deployment that
    // retired the action's id no retry from the page would pass: useGuardedActionState.test.tsx.)
    submitQuote.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<QuoteForm config={CUSTOM} code="CAP-150x210-CT01-H120-PL-LED" responseTime="24 de ore" />);
    fillValid();
    const details = screen.getByLabelText("Detalii (opțional)");
    fireEvent.change(details, { target: { value: "Tăblia cu 10 cm mai înaltă, dacă se poate." } });
    fireEvent.change(screen.getByLabelText("Localitate"), { target: { value: "Cluj" } });
    const submit = screen.getByRole("button", { name: "Trimite configurația" });

    fireEvent.click(submit);

    // The form's own generic message, which already says what to do next.
    expect(await screen.findByRole("alert")).toHaveTextContent("Nu am putut trimite cererea. Încearcă din nou sau sună-ne.");
    expect(FORM_MESSAGES.generic).toBe("Nu am putut trimite cererea. Încearcă din nou sau sună-ne.");
    // The same textarea, not a fresh empty one: the form was never taken down.
    expect(screen.getByLabelText("Detalii (opțional)")).toBe(details);
    expect(details).toHaveValue("Tăblia cu 10 cm mai înaltă, dacă se poate.");
    expect(screen.getByLabelText("Nume")).toHaveValue("Ana Pop");
    expect(screen.getByLabelText("Telefon")).toHaveValue("0722 123 456");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
    expect(screen.getByLabelText("Localitate")).toHaveValue("Cluj");
    expect(screen.getByRole("checkbox", { name: /Sunt de acord/ })).toBeChecked();
    expect(screen.getByLabelText("Nume")).not.toHaveAttribute("aria-invalid");
    expect(hiddenConfig(container)).toHaveValue(paramsFromConfig(CUSTOM).toString());
    expect(screen.getByTestId("attached-code")).toHaveTextContent("CAP-150x210-CT01-H120-PL-LED");
    expect(submit).toBeEnabled();
    expect(tracked).not.toHaveBeenCalled();

    fireEvent.click(submit);
    expect(await screen.findByText(`Configurație trimisă · ${CODE}`)).toBeInTheDocument();
    const formData = submitQuote.mock.calls[1][1];
    expect(formData.get(QUOTE_FIELDS.config)).toBe(paramsFromConfig(CUSTOM).toString());
    expect(formData.get("name")).toBe("Ana Pop");
    expect(formData.get("city")).toBe("Cluj");
    expect(formData.get("message")).toBe("Tăblia cu 10 cm mai înaltă, dacă se poate.");
    // quote_submit for the request that went through, not for the failed call.
    await waitFor(() => expect(tracked.mock.calls).toEqual([["quote_submit", { code: CODE }]]));
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    const thrown = redirectTo("/configurator");
    submitQuote.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <QuoteForm config={DEFAULT_CONFIG} code={CODE} responseTime="24 de ore" />
      </Boundary>,
      { onCaughtError: caught },
    );
    fillValid();

    fireEvent.click(screen.getByRole("button", { name: "Trimite configurația" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(FORM_MESSAGES.generic)).toBeNull();
    expect(tracked).not.toHaveBeenCalled();
  });
});
