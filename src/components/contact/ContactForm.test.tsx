import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Activity, Component, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
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
// The analytics script is not injected in tests; the mock records the calls (ARHITECTURA §10).
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { ContactForm, collectSource } from "./ContactForm";

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
  tracked.mockReset();
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
    expect(honeypot).toHaveAccessibleName("Lasă acest câmp gol"); // labelled, like every input
    expect(honeypot).toHaveAttribute("name", "website"); // never `company`: Chrome autofills that

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

  it("asks for the form token again after a call that brought no answer, until one does, and posts it", async () => {
    // The visitor's connection was away at her first touches of the form.
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    issueFormToken.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<ContactForm responseTime="24 de ore" page="/contact" />);
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
    fireEvent.pointerDown(screen.getByRole("button", { name: "Trimite cererea" }));
    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));
    await waitFor(() => expect(submitContact).toHaveBeenCalledTimes(1));
    expect(submitContact.mock.calls[0][1].get(FORM_FIELDS.startedAt)).toBe("signed-token");
    expect(issueFormToken).toHaveBeenCalledTimes(3);
  });

  it("asks for a new form token once the one it holds is too old for the server, and posts the new one", async () => {
    // She touched the form on Monday evening and comes back to it on Tuesday evening. The server
    // refuses a token older than 24 hours (form-token.ts), so the token of Monday can no longer pass.
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    issueFormToken.mockResolvedValueOnce("token-of-monday").mockResolvedValueOnce("token-of-tuesday");
    vi.setSystemTime(new Date("2026-11-23T20:00:00+02:00"));
    try {
      const { container } = render(<ContactForm responseTime="24 de ore" page="/contact" />);
      const startedAt = container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`);
      fireEvent.focus(screen.getByLabelText("Nume"));
      await waitFor(() => expect(startedAt).toHaveValue("token-of-monday"));

      // Tuesday afternoon, 21 hours later, the server still accepts the token: nothing asks again
      // (a new token would start the three seconds of the minimum time once more).
      vi.setSystemTime(new Date("2026-11-24T17:00:00+02:00"));
      fireEvent.focus(screen.getByLabelText("Telefon"));
      fireEvent.pointerDown(screen.getByLabelText("Email"));
      expect(issueFormToken).toHaveBeenCalledTimes(1);

      // Tuesday, 25 hours after the first touch: the first focus asks for a new token.
      vi.setSystemTime(new Date("2026-11-24T21:00:00+02:00"));
      fireEvent.focus(screen.getByLabelText("Telefon"));
      expect(issueFormToken).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(startedAt).toHaveValue("token-of-tuesday"));

      // The submit carries the new token, and nothing asks a third time.
      fillValid();
      fireEvent.pointerDown(screen.getByRole("button", { name: "Trimite cererea" }));
      fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));
      await waitFor(() => expect(submitContact).toHaveBeenCalledTimes(1));
      expect(submitContact.mock.calls[0][1].get(FORM_FIELDS.startedAt)).toBe("token-of-tuesday");
      expect(issueFormToken).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for a new form token at the submit of a form untouched since yesterday, so that trying again passes", async () => {
    // The field kept the focus overnight: she presses Enter with no new focus or pointer-down. The
    // server refuses the token of Monday with „… prea repede. Încearcă din nou.”; trying again must work.
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    issueFormToken.mockResolvedValueOnce("token-of-monday").mockResolvedValueOnce("token-of-tuesday");
    submitContact
      .mockResolvedValueOnce({ status: "error", message: FORM_MESSAGES.tooFast })
      .mockResolvedValueOnce({ status: "ok", leadId: "lead-1" });
    vi.setSystemTime(new Date("2026-11-23T20:00:00+02:00"));
    try {
      const { container } = render(<ContactForm responseTime="24 de ore" page="/contact" />);
      const startedAt = container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`);
      fireEvent.focus(screen.getByLabelText("Nume"));
      await waitFor(() => expect(startedAt).toHaveValue("token-of-monday"));
      fillValid();

      vi.setSystemTime(new Date("2026-11-24T21:00:00+02:00"));
      const submit = screen.getByRole("button", { name: "Trimite cererea" });
      fireEvent.click(submit);
      expect(await screen.findByRole("alert")).toHaveTextContent(FORM_MESSAGES.tooFast);
      expect(submitContact.mock.calls[0][1].get(FORM_FIELDS.startedAt)).toBe("token-of-monday");

      // That submit asked for a new token; what she typed is still there.
      expect(issueFormToken).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(startedAt).toHaveValue("token-of-tuesday"));
      expect(screen.getByLabelText("Nume")).toHaveValue("Ana Pop");

      fireEvent.click(submit);
      expect(await screen.findByText("Cerere trimisă")).toBeInTheDocument();
      expect(submitContact.mock.calls[1][1].get(FORM_FIELDS.startedAt)).toBe("token-of-tuesday");
      expect(issueFormToken).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the token it holds when the call for a new one brings no answer, and asks again at the next touch", async () => {
    // Monday's token is 23 and a half hours old: old enough for the form to ask for a new one,
    // young enough for the server, which takes it for another half hour.
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    issueFormToken
      .mockResolvedValueOnce("token-of-monday")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce("token-of-tuesday");
    vi.setSystemTime(new Date("2026-11-23T20:00:00+02:00"));
    try {
      const { container } = render(<ContactForm responseTime="24 de ore" page="/contact" />);
      const startedAt = container.querySelector(`input[name="${FORM_FIELDS.startedAt}"]`);
      fireEvent.focus(screen.getByLabelText("Nume"));
      await waitFor(() => expect(startedAt).toHaveValue("token-of-monday"));
      fillValid();

      // Her laptop wakes up on Tuesday at 19:30 with the connection still away.
      vi.setSystemTime(new Date("2026-11-24T19:30:00+02:00"));
      fireEvent.focus(screen.getByLabelText("Telefon"));
      expect(issueFormToken).toHaveBeenCalledTimes(2);
      await act(async () => {}); // the rejection arrives
      // A failed renewal must not cost her the token that still works.
      expect(startedAt).toHaveValue("token-of-monday");

      // The next touch asks again; the submit that follows it at once still carries Monday's token,
      // which the server takes (the new one would be refused as too fresh).
      fireEvent.pointerDown(screen.getByRole("button", { name: "Trimite cererea" }));
      expect(issueFormToken).toHaveBeenCalledTimes(3);
      fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));
      await waitFor(() => expect(submitContact).toHaveBeenCalledTimes(1));
      expect(submitContact.mock.calls[0][1].get(FORM_FIELDS.startedAt)).toBe("token-of-monday");
      expect(issueFormToken).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
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
    expect(tracked).not.toHaveBeenCalled();
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
    // The focus and the event come from an effect, a moment after the confirmation is on screen.
    await waitFor(() => expect(document.activeElement).toBe(heading));

    // contact_submit once per success (ARHITECTURA §10).
    expect(tracked).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveBeenCalledWith("contact_submit", undefined);
  });

  it("renders the confirmation as an H2 under the H1 of /contact", async () => {
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    render(<ContactForm responseTime="24 de ore" page="/contact" confirmHeadingLevel={2} />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));

    const heading = await screen.findByRole("heading", { level: 2, name: "Mulțumim! Te sunăm în 24 de ore." });
    expect(heading.className).toContain("h3-confirm");
    await waitFor(() => expect(document.activeElement).toBe(heading));
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

    // A second request from the remounted form is a second contact_submit, and its
    // confirmation takes the focus as the first one did.
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));
    await screen.findByText("Cerere trimisă");
    await waitFor(() =>
      expect(tracked.mock.calls).toEqual([
        ["contact_submit", undefined],
        ["contact_submit", undefined],
      ]),
    );
    const second = screen.getByRole("heading", { level: 2, name: "Mulțumim! Te sunăm în 24 de ore." });
    expect(second).not.toBe(heading);
    expect(document.activeElement).toBe(second);
  });

  it("reports contact_submit once and leaves the focus where it is when the router shows the kept page again", async () => {
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    const page = (shown: boolean) => (
      <KeptPage shown={shown}>
        <ContactForm responseTime="24 de ore" page="/contact" />
      </KeptPage>
    );
    const view = render(page(true));
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));
    const heading = await screen.findByRole("heading", { name: "Mulțumim! Te sunăm în 24 de ore." });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(tracked).toHaveBeenCalledTimes(1);

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
    expect(tracked).not.toHaveBeenCalled();
  });

  it("keeps the form and what was typed when the call to the action fails, and sends on the next try", async () => {
    // No answer comes back: the visitor's connection dropped for a moment. (After a deployment that
    // retired the action's id no retry from the page would pass: useGuardedActionState.test.tsx.)
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    submitContact.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ContactForm responseTime="24 de ore" page="/contact" />);
    fillValid();
    const message = screen.getByLabelText("Ce pat îți dorești?");
    fireEvent.change(message, { target: { value: "Un pat de 160, cu ladă." } });
    fireEvent.change(screen.getByLabelText("Dimensiunea saltelei"), { target: { value: "160 × 200 cm" } });
    const submit = screen.getByRole("button", { name: "Trimite cererea" });

    fireEvent.click(submit);

    // The form's own generic message, which already says what to do next.
    expect(await screen.findByRole("alert")).toHaveTextContent("Nu am putut trimite cererea. Încearcă din nou sau sună-ne.");
    expect(FORM_MESSAGES.generic).toBe("Nu am putut trimite cererea. Încearcă din nou sau sună-ne.");
    // The same textarea, not a fresh empty one: the form was never taken down.
    expect(screen.getByLabelText("Ce pat îți dorești?")).toBe(message);
    expect(message).toHaveValue("Un pat de 160, cu ladă.");
    expect(screen.getByLabelText("Nume")).toHaveValue("Ana Pop");
    expect(screen.getByLabelText("Telefon")).toHaveValue("0722 123 456");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
    expect(screen.getByLabelText("Dimensiunea saltelei")).toHaveValue("160 × 200 cm");
    expect(screen.getByRole("checkbox", { name: /Sunt de acord/ })).toBeChecked();
    expect(screen.getByLabelText("Nume")).not.toHaveAttribute("aria-invalid");
    expect(submit).toBeEnabled();
    expect(tracked).not.toHaveBeenCalled();

    fireEvent.click(submit);
    expect(await screen.findByText("Cerere trimisă")).toBeInTheDocument();
    const formData = submitContact.mock.calls[1][1];
    expect(formData.get("name")).toBe("Ana Pop");
    expect(formData.get("message")).toBe("Un pat de 160, cu ladă.");
    expect(formData.get("mattressSize")).toBe("160 × 200 cm");
    // contact_submit for the request that went through, not for the failed call.
    await waitFor(() => expect(tracked).toHaveBeenCalledTimes(1));
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    parseLeadForm.mockReturnValue({ ok: true, data: {} });
    const thrown = redirectTo("/contact");
    submitContact.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <ContactForm responseTime="24 de ore" page="/contact" />
      </Boundary>,
      { onCaughtError: caught },
    );
    fillValid();

    fireEvent.click(screen.getByRole("button", { name: "Trimite cererea" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(FORM_MESSAGES.generic)).toBeNull();
    expect(tracked).not.toHaveBeenCalled();
  });
});
