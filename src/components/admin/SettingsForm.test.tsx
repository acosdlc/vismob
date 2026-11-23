import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_FIELDS, SETTINGS_FINGERPRINT_FIELD, SETTINGS_GROUPS } from "@/lib/admin/settings-fields";
import { settingsFingerprint } from "@/lib/admin/settings-fingerprint";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const saveSettings = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-settings", () => ({
  saveSettings: (...args: [AdminActionState, FormData]) => saveSettings(...args),
}));

// The last tests put the form next to its two real neighbours: the Setări page around it and, in
// one of them, the real saveSettings behind it. Both reach the `settings` row through this
// signed-in client; the action also checks the session and expires the site's tag.
const server = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: server.createClient }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => ({ userId: "user-1", email: "atelier@example.com" }) }));

// The hook is the real one. A test that sets `answered.state` gets the form of a page rendered
// as the answer to a post made without JavaScript: it starts from that state, not from idle.
const answered = vi.hoisted(() => ({ state: null as AdminActionState | null }));
vi.mock("@/components/site/form/useGuardedActionState", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/site/form/useGuardedActionState")>();
  const useGuardedActionState: typeof real.useGuardedActionState = (action, initialState, failed) =>
    real.useGuardedActionState(action, (answered.state as typeof initialState | null) ?? initialState, failed);
  return { useGuardedActionState };
});

// PhotoField's upload path (the workshop photo, PR-9): the bucket answers when the test
// says so, compression is the identity (jsdom has no canvas).
const upload = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ upload }) } }) }));
vi.mock("browser-image-compression", () => ({ default: async (file: File) => file }));

import SetariPage from "@/app/admin/(panel)/setari/page";
import { PHOTO_TEXTS } from "./PhotoField";
import { SettingsForm } from "./SettingsForm";

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

const PHOTO = "site/atelier-1792569508760.webp";

const SETTINGS: Settings = {
  ...SEED_SETTINGS,
  workshop_name: "Atelierul",
  whatsapp_number: "40722123456",
  instagram_url: "https://www.instagram.com/atelier",
  show_prices: true,
  atelier_photo_path: PHOTO,
};

const PHOTO_LABEL = "Poza atelierului";

/** The fingerprint of the stored row the page read (settingsFingerprint, a SHA-256 in hex), as the page passes it. */
const LOADED = "1f".repeat(32);

/** saveSettings' answer when the stored row is no longer that one (SETTINGS_MESSAGES.stale). */
const STALE = "Setările au fost schimbate între timp din altă fereastră. Reîncarcă pagina și reia modificarea.";

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
}

function pickPhoto() {
  const input = screen.getByLabelText(PHOTO_LABEL);
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], "poza.jpg", { type: "image/jpeg" })] } });
}

/**
 * The form as the browser gets it: "rendered" there (Setări reached from the menu) or "hydrated",
 * attached to the markup the server sent (the page opened by its address, or reloaded). React
 * fills a box differently in the two: rendered, it writes the value into every box that has one;
 * hydrated, it leaves a single-line box as the markup made it. A box nobody typed in then shows
 * a default that changes later: rendered, only a box that was empty; hydrated, every single-line
 * box as well, filled or not. (A filled textarea and the tick box never do.)
 */
function mount(form: ReactElement, how: "rendered" | "hydrated") {
  if (how === "rendered") return render(form);
  const container = document.body.appendChild(document.createElement("div"));
  container.innerHTML = renderToString(form);
  const served = container.querySelector("form");
  const mismatch = vi.fn();
  const view = render(form, { container, hydrate: true, onRecoverableError: mismatch });
  // React attached to the server's markup: after a mismatch it would have rendered the form anew.
  expect(mismatch).not.toHaveBeenCalled();
  expect(container.querySelector("form")).toBe(served);
  return view;
}

/**
 * The signed-in client over a `settings` table of one row: the Setări page reads it, the real
 * saveSettings reads and writes it. The table keeps what is written, so one save can follow
 * another. Given no row, the read fails.
 */
function settingsTable(initial: Settings | null) {
  let row = initial;
  const maybeSingle = async () =>
    row ? { data: { data: row }, error: null } : { data: null, error: { message: "connection refused" } };
  const update = (payload: { data: Settings }) => ({
    eq: () => ({
      select: async () => {
        row = payload.data;
        return { data: [{ id: 1, data: row }], error: null };
      },
    }),
  });
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }), update }),
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  };
  return { client, stored: () => row };
}

beforeEach(() => {
  answered.state = null;
  saveSettings.mockReset();
  saveSettings.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
  server.createClient.mockReset();
  upload.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SettingsForm", () => {
  it("renders a labelled control for every Settings key, grouped as the seed, with the current values", () => {
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);

    for (const group of SETTINGS_GROUPS) {
      expect(screen.getByRole("heading", { level: 2, name: group.title })).toBeInTheDocument();
    }

    for (const field of SETTINGS_FIELDS) {
      const control = screen.getByLabelText(field.label);
      if (field.kind === "photo") {
        // The file input has no name: the two hidden inputs carry the path (see below).
        expect(control).toHaveAttribute("type", "file");
        expect(control).not.toHaveAttribute("name");
      } else {
        expect(control).toHaveAttribute("name", field.key);
      }
      if (field.kind === "boolean") {
        expect(control).toHaveAttribute("type", "checkbox");
      } else if (field.kind !== "photo") {
        expect(control.tagName).toBe(field.kind === "textarea" ? "TEXTAREA" : "INPUT");
        expect(control).toHaveValue(SETTINGS[field.key] as string);
        expect(control).toHaveAttribute("maxlength", String(field.maxLength));
      }
      if (field.hint) expect(control).toHaveAccessibleDescription(field.hint);
      else expect(control).not.toHaveAttribute("aria-describedby");
      expect(control).not.toHaveAttribute("aria-invalid");
    }

    expect(screen.getByLabelText("Instagram")).toHaveAttribute("type", "url");
    expect(screen.getByLabelText("WhatsApp")).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText("Povestea atelierului")).toHaveAttribute("rows", "4");
    expect(screen.getByLabelText("Structura")).toHaveAttribute("rows", "3");
    expect(screen.getByLabelText("Structura").closest("div")?.className).toContain("col-span-full");

    const submit = screen.getByRole("button", { name: "Salvează" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).not.toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the workshop photo as a PhotoField in the Atelier group, posting the path under the key's names", () => {
    const { unmount } = render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);

    expect(hidden("atelier_photo_path")).toHaveValue(PHOTO);
    expect(hidden("atelier_photo_path_before")).toHaveValue(PHOTO);
    // The default PhotoField names are not used: the key is a Settings key.
    expect(hidden("photo_path")).toBeNull();
    expect(hidden("photo_path_before")).toBeNull();

    const input = screen.getByLabelText(PHOTO_LABEL);
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAccessibleDescription(expect.stringContaining("la 4:5"));
    // The field spans the grid row, under the „Atelier” heading.
    const field = input.closest("[data-field]");
    expect(field).toHaveAttribute("data-field", "atelier_photo_path");
    expect(field?.parentElement?.className).toContain("col-span-full");
    const section = input.closest("section");
    expect(section?.querySelector("h2")?.textContent).toBe("Atelier");
    // 4:3 preview box, showing the current photo from the public bucket URL.
    const img = field?.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.supabase.co/storage/v1/object/public/media/site/atelier-1792569508760.webp");
    expect(img?.parentElement?.className).toContain("aspect-[4/3]");
    expect(screen.getByRole("button", { name: PHOTO_TEXTS.remove })).toBeInTheDocument();
    unmount();

    // Without a photo (the seed's ""), both hidden inputs post "" and the preview says so.
    render(<SettingsForm settings={{ ...SETTINGS, atelier_photo_path: "" }} fingerprint={LOADED} />);
    expect(hidden("atelier_photo_path")).toHaveValue("");
    expect(hidden("atelier_photo_path_before")).toHaveValue("");
    expect(screen.getByText(PHOTO_TEXTS.none)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PHOTO_TEXTS.remove })).toBeNull();
  });

  it("holds the submit while the photo is uploading, then posts the new path and the old one as _before", async () => {
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    pickPhoto();
    expect(submit).toBeDisabled();
    // A scripted submit during the upload must not reach the action either.
    fireEvent.submit(submit.closest("form")!);
    expect(saveSettings).not.toHaveBeenCalled();

    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument();
    const [path] = upload.mock.calls[0];
    expect(path).toMatch(/^site\/atelier-\d{13}\.webp$/);

    fireEvent.click(submit);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    const formData = saveSettings.mock.calls[0][1];
    expect(formData.get("atelier_photo_path")).toBe(path);
    expect(formData.get("atelier_photo_path_before")).toBe(PHOTO);
  });

  it("shows the server's error on the photo field", async () => {
    saveSettings.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { atelier_photo_path: "Poza nu e validă; încarc-o din nou." },
    });
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    const input = screen.getByLabelText(PHOTO_LABEL);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Poza nu e validă; încarc-o din nou.")).toBeInTheDocument();
    expect(screen.getByLabelText("Localitatea")).not.toHaveAttribute("aria-invalid");
  });

  it("reflects show_prices in the checkbox", () => {
    const { unmount } = render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).toBeChecked();
    unmount();

    render(<SettingsForm settings={{ ...SETTINGS, show_prices: false }} fingerprint={LOADED} />);
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).not.toBeChecked();
  });

  it("submits every field to the action and shows the saved notice, keeping the typed values", async () => {
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    fireEvent.change(screen.getByLabelText("Localitatea"), { target: { value: "Cluj-Napoca" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" }));

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    const formData = saveSettings.mock.calls[0][1];
    for (const field of SETTINGS_FIELDS) {
      if (field.kind === "boolean") continue;
      expect(formData.get(field.key)).toBe(field.key === "city" ? "Cluj-Napoca" : SETTINGS[field.key]);
    }
    expect(formData.get("show_prices")).toBeNull(); // unticked in this test

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(screen.getByLabelText("Localitatea")).toHaveValue("Cluj-Napoca");
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Salvează" })).not.toBeDisabled();
  });

  it("hides the saved notice as soon as the form is edited after a save, and shows it again after the next save", async () => {
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");

    // Typed after the save: „Salvat.” in the pinned bar would speak for a text that is not saved.
    fireEvent.change(screen.getByLabelText("Localitatea"), { target: { value: "Cluj-Napoca" } });
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(screen.getByLabelText("Localitatea")).toHaveValue("Cluj-Napoca");

    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(saveSettings.mock.calls[1][1].get("city")).toBe("Cluj-Napoca");

    // A tick is an edit as well.
    fireEvent.click(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" }));
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();

    // Saved, then saved once more with nothing changed in between: the notice goes while
    // the save runs and is back with its answer.
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    expect(saveSettings).toHaveBeenCalledTimes(4);
  });

  it("does not call saved what is changed while the save is still on its way", async () => {
    // The action answers when the test says so, to stand between the submit and its answer.
    const answers: Array<(state: AdminActionState) => void> = [];
    const held = () => new Promise<AdminActionState>((resolve) => answers.push(resolve));
    const saved: AdminActionState = { status: "ok", message: ADMIN_MESSAGES.saved };
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    saveSettings.mockImplementationOnce(held);
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    // The submit left with the old value; this is typed before its answer.
    fireEvent.change(screen.getByLabelText("Localitatea"), { target: { value: "Cluj-Napoca" } });
    answers.shift()?.(saved);
    await waitFor(() => expect(submit).toBeEnabled());
    expect(saveSettings.mock.calls[0][1].get("city")).toBe(SETTINGS.city);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();

    // The next save carries it, and the notice is back.
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toBeInTheDocument();
    expect(saveSettings.mock.calls[1][1].get("city")).toBe("Cluj-Napoca");

    // The same for the photo: removed while a save is on its way, it is not in that save.
    saveSettings.mockImplementationOnce(held);
    fireEvent.click(submit);
    fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
    answers.shift()?.(saved);
    await waitFor(() => expect(submit).toBeEnabled());
    expect(saveSettings.mock.calls[2][1].get("atelier_photo_path")).toBe(PHOTO);
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
  });

  it("hides the saved notice when the photo is removed or replaced after a save", async () => {
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.saved);
    // „Șterge poza” is a click: no change event reaches the form, the photo field reports it.
    fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    expect(hidden("atelier_photo_path")).toHaveValue("");

    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.saved);
    pickPhoto();
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    expect(screen.queryByText(ADMIN_MESSAGES.saved)).toBeNull();
  });

  it("keeps the error notice, the field errors and the focus while the form is edited", async () => {
    saveSettings.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { instagram_url: "Scrie un link complet, cu https://" },
    });
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await screen.findByRole("alert");
    const instagram = screen.getByLabelText("Instagram");
    await waitFor(() => expect(document.activeElement).toBe(instagram));

    // Another field is edited: nothing the refused save left on screen moves.
    const city = screen.getByLabelText("Localitatea");
    city.focus();
    fireEvent.change(city, { target: { value: "Cluj-Napoca" } });

    expect(screen.getByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(instagram).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Scrie un link complet, cu https://")).toBeInTheDocument();
    expect(document.activeElement).toBe(city);
  });

  it("shows the server's message and field errors, and focuses the first invalid field", async () => {
    saveSettings.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { whatsapp_number: "Scrie numărul internațional, doar cifre, fără +", instagram_url: "Scrie un link complet, cu https://" },
    });
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");

    const whatsapp = screen.getByLabelText("WhatsApp");
    expect(whatsapp).toHaveAttribute("aria-invalid", "true");
    expect(whatsapp.className).toContain("border-error");
    expect(whatsapp).toHaveAccessibleDescription(
      `${SETTINGS_FIELDS.find((f) => f.key === "whatsapp_number")?.hint} Scrie numărul internațional, doar cifre, fără +`,
    );
    expect(screen.getByLabelText("Instagram")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Localitatea")).not.toHaveAttribute("aria-invalid");
    // whatsapp_number comes before instagram_url in the form order.
    await waitFor(() => expect(document.activeElement).toBe(whatsapp));
  });

  it("shows a plain error without field errors", async () => {
    saveSettings.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    for (const field of SETTINGS_FIELDS) expect(screen.getByLabelText(field.label)).not.toHaveAttribute("aria-invalid");
  });

  it("keeps the form and everything typed when the call to the action fails, and saves on the next try", async () => {
    // No answer comes back: a dropped connection, a laptop just back from sleep, a deployment made meanwhile.
    saveSettings.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const city = screen.getByLabelText("Localitatea");
    fireEvent.change(city, { target: { value: "Cluj-Napoca" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" }));
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);

    // Not „Nu am putut salva…”, which the server answers when a write failed: here nobody knows
    // whether the save went through, and after a deployment another try from this page cannot work.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
    expect(alert).not.toHaveTextContent(ADMIN_MESSAGES.generic);
    expect(alert.className).toContain("border-error");
    // The same input, not a fresh one with the saved value: the form was never taken down.
    expect(screen.getByLabelText("Localitatea")).toBe(city);
    expect(city).toHaveValue("Cluj-Napoca");
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).not.toBeChecked();
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(saveSettings.mock.calls[1][1].get("city")).toBe("Cluj-Napoca");
    expect(saveSettings.mock.calls[1][1].get("show_prices")).toBeNull();
    reported.mockRestore();
  });

  it("keeps an uploaded photo through a failed call: the next try posts its path", async () => {
    saveSettings.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The reason is not on screen; the hook leaves it on the console (useGuardedActionState).
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const submit = screen.getByRole("button", { name: "Salvează" });
    pickPhoto();
    await waitFor(() => expect(submit).toBeEnabled());
    const [path] = upload.mock.calls[0];

    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
    expect(hidden("atelier_photo_path")).toHaveValue(path);

    fireEvent.click(submit);
    // By its text: the photo field has a status line of its own.
    await screen.findByText(ADMIN_MESSAGES.saved);
    expect(saveSettings.mock.calls[1][1].get("atelier_photo_path")).toBe(path);
    expect(saveSettings.mock.calls[1][1].get("atelier_photo_path_before")).toBe(PHOTO);
    reported.mockRestore();
  });

  it("lets a redirect thrown by the action through to the framework instead of calling it a failure", async () => {
    const thrown = redirectTo("/admin/setari");
    saveSettings.mockRejectedValueOnce(thrown);
    const caught = vi.fn();
    render(
      <Boundary>
        <SettingsForm settings={SETTINGS} fingerprint={LOADED} />
      </Boundary>,
      { onCaughtError: caught },
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(caught).toHaveBeenCalledTimes(1));
    expect(caught.mock.calls[0][0]).toBe(thrown);
    expect(screen.queryByText(ADMIN_MESSAGES.noAnswer)).toBeNull();
  });

  it("posts the fingerprint of the row the page loaded, in a hidden input", async () => {
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(LOADED);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(saveSettings.mock.calls[0][1].get(SETTINGS_FINGERPRINT_FIELD)).toBe(LOADED);
  });

  it("posts with each save the fingerprint the last save returned, also after a refused save or a failed call", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const posted = (call: number) => saveSettings.mock.calls[call][1].get(SETTINGS_FINGERPRINT_FIELD);
    const first = "2e".repeat(32);
    const second = "3d".repeat(32);
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const submit = screen.getByRole("button", { name: "Salvează" });

    // The first save carries what the page loaded; the row it leaves has another fingerprint.
    saveSettings.mockResolvedValueOnce({ status: "ok", message: ADMIN_MESSAGES.saved, fingerprint: first });
    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.saved);
    expect(posted(0)).toBe(LOADED);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(first);

    // A save refused for a field wrote nothing: the stored row is still the one of the first save.
    saveSettings.mockResolvedValueOnce({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { city: ADMIN_MESSAGES.required },
    });
    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.invalid);
    expect(posted(1)).toBe(first);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(first);

    // A call that brought no answer may have written all the same: the form cannot know what the
    // row holds now, so it goes on posting the fingerprint it has.
    saveSettings.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.noAnswer);
    expect(posted(2)).toBe(first);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(first);

    // The retry carries that older fingerprint. If the lost call did write, saveSettings finds the
    // row holding these very values and saves like any other time (save-settings.test.ts); either
    // way its answer names the row as it is now, and the form follows it.
    saveSettings.mockResolvedValueOnce({ status: "ok", message: ADMIN_MESSAGES.saved, fingerprint: second });
    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.saved);
    expect(posted(3)).toBe(first);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(second);

    fireEvent.click(submit);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(5));
    expect(posted(4)).toBe(second);
    // An answer that names no row leaves the fingerprint where it was.
    await screen.findByText(ADMIN_MESSAGES.saved);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(second);
    reported.mockRestore();
  });

  it("keeps everything typed, and the fingerprint it loaded with, when the save is refused because the row changed meanwhile", async () => {
    saveSettings.mockResolvedValue({ status: "error", message: STALE });
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const city = screen.getByLabelText("Localitatea");
    fireEvent.change(city, { target: { value: "Cluj-Napoca" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" }));
    const submit = screen.getByRole("button", { name: "Salvează" });

    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(STALE);
    expect(alert.className).toContain("border-error");
    // Like every other refused save: the same inputs, with what was typed in them, and no field marked.
    expect(screen.getByLabelText("Localitatea")).toBe(city);
    expect(city).toHaveValue("Cluj-Napoca");
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).not.toBeChecked();
    for (const field of SETTINGS_FIELDS) expect(screen.getByLabelText(field.label)).not.toHaveAttribute("aria-invalid");
    expect(submit).toBeEnabled();

    // Nothing here stands on the newer row, so the form goes on posting the old fingerprint:
    // another try is refused again, until the page is reloaded as the message asks.
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(LOADED);
    fireEvent.click(submit);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2));
    expect(saveSettings.mock.calls[1][1].get(SETTINGS_FINGERPRINT_FIELD)).toBe(LOADED);
    expect(await screen.findByRole("alert")).toHaveTextContent(STALE);
  });

  it.each(["rendered", "hydrated"] as const)(
    "keeps every box and the fingerprint of the row it was filled from when the page is rendered again with a newer row (form %s)",
    async (how) => {
      // In the row this copy is filled from, WhatsApp and the story are empty.
      const mine: Settings = { ...SETTINGS, whatsapp_number: "", story_text: "" };
      const { rerender } = mount(<SettingsForm settings={mine} fingerprint={LOADED} />, how);
      fireEvent.change(screen.getByLabelText("Localitatea"), { target: { value: "Cluj-Napoca" } });

      // The page is rendered again under the open form (the refresh an action's answer brings, a
      // return to the screen the router kept) with the row someone else saved meanwhile.
      const newer: Settings = {
        ...mine,
        workshop_name: "Alt nume",
        whatsapp_number: "40733111222",
        address: "Str. Nouă nr. 1",
        story_text: "Facem paturi din 2009.",
        show_prices: false,
      };
      rerender(<SettingsForm settings={newer} fingerprint={"4c".repeat(32)} />);

      // What she typed stays, and so does every box nobody typed in, filled or empty. Were the
      // boxes to follow the page, the newer values would show in them with no notice, under the
      // older fingerprint: a save would then write them back once that row was put back.
      expect(screen.getByLabelText("Localitatea")).toHaveValue("Cluj-Napoca");
      expect(screen.getByLabelText("Numele atelierului")).toHaveValue(mine.workshop_name);
      expect(screen.getByLabelText("Adresa atelierului")).toHaveValue(mine.address);
      expect(screen.getByLabelText("WhatsApp")).toHaveValue("");
      expect(screen.getByLabelText("Povestea atelierului")).toHaveValue("");
      expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).toBeChecked();
      // With the newer fingerprint this copy would pass the check and put its old values over that row.
      expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(LOADED);

      // So a save carries one row, the one the form was filled from, with what she typed, under
      // that row's fingerprint: refused while the stored row is the newer one.
      fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
      await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
      const posted = saveSettings.mock.calls[0][1];
      for (const field of SETTINGS_FIELDS) {
        if (field.kind === "boolean" || field.kind === "photo") continue;
        expect(posted.get(field.key)).toBe(field.key === "city" ? "Cluj-Napoca" : mine[field.key]);
      }
      expect(posted.get("show_prices")).toBe("on");
      expect(posted.get(SETTINGS_FINGERPRINT_FIELD)).toBe(LOADED);
    },
  );

  it("lets the photo field follow the page: after the form's own save, the next one names the new photo as the one it loaded with", async () => {
    const saved = "2e".repeat(32);
    const { rerender } = render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);
    const submit = screen.getByRole("button", { name: "Salvează" });
    pickPhoto();
    await waitFor(() => expect(submit).toBeEnabled());
    const [path] = upload.mock.calls[0];
    saveSettings.mockResolvedValueOnce({ status: "ok", message: ADMIN_MESSAGES.saved, fingerprint: saved });
    fireEvent.click(submit);
    await screen.findByText(ADMIN_MESSAGES.saved);
    expect(saveSettings.mock.calls[0][1].get("atelier_photo_path_before")).toBe(PHOTO);

    // The refresh that the save's answer brings: the page with the row as that save left it.
    rerender(<SettingsForm settings={{ ...SETTINGS, atelier_photo_path: path }} fingerprint={saved} />);

    // By now the real action has removed PHOTO from the bucket. Were `_before` to stay on the row
    // of the first render, as the boxes do, a second new photo would name PHOTO again as the one
    // to remove and leave this one in the bucket for good.
    expect(hidden("atelier_photo_path")).toHaveValue(path);
    expect(hidden("atelier_photo_path_before")).toHaveValue(path);
    expect(screen.queryByText(PHOTO_TEXTS.uploaded)).toBeNull();
  });

  it("starts from the page's own fingerprint when the page is the answer to a save posted without JavaScript", async () => {
    // Such a page is rendered whole after the save, so its fields and its fingerprint come from
    // the row read then. Had someone else saved in between, that row is newer than the answer.
    answered.state = { status: "ok", message: ADMIN_MESSAGES.saved, fingerprint: "2e".repeat(32) };
    render(<SettingsForm settings={SETTINGS} fingerprint={LOADED} />);

    expect(screen.getByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(LOADED);

    // From here on the form follows its own saves.
    saveSettings.mockResolvedValueOnce({ status: "ok", message: ADMIN_MESSAGES.saved, fingerprint: "3d".repeat(32) });
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await waitFor(() => expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue("3d".repeat(32)));
    expect(saveSettings.mock.calls[0][1].get(SETTINGS_FINGERPRINT_FIELD)).toBe(LOADED);
  });

  it("locks the save when the page could not read the saved row, keeping the fields visible", async () => {
    // No row was read, so the page has no fingerprint to pass: "", which no stored row answers to.
    render(<SettingsForm settings={SEED_SETTINGS} fingerprint="" locked />);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue("");

    const submit = screen.getByRole("button", { name: "Salvează" });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Reîncarcă pagina înainte de a modifica ceva.");
    expect(screen.queryByRole("status")).toBeNull();
    for (const field of SETTINGS_FIELDS) expect(screen.getByLabelText(field.label)).toBeInTheDocument();
    expect(screen.getByLabelText("Numele atelierului")).toHaveValue(SEED_SETTINGS.workshop_name);

    // A scripted submit (the button cannot be clicked) must not reach the action either.
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

// The router keeps the Setări screen while she is on another one and renders the page again when
// she comes back; an action's answer brings a render of the page too. The form under it is the
// same form each time, unless the page gives it another key.
describe("the Setări page, rendered again around SettingsForm", () => {
  it("starts the form over from the stored row when the page first could not read it and now can", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    server.createClient.mockResolvedValue(settingsTable(null).client);
    const { rerender } = render(await SetariPage());
    // No row was read: the seed in the boxes, no fingerprint, the save locked.
    expect(screen.getByLabelText("Numele atelierului")).toHaveValue(SEED_SETTINGS.workshop_name);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salvează" })).toBeDisabled();
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    server.createClient.mockResolvedValue(settingsTable(SETTINGS).client);
    rerender(await SetariPage());

    // A form that lived on would be a dead end: the seed still in its boxes, the button enabled,
    // and a fingerprint no row answers to, so every save refused as changed in another window.
    for (const field of SETTINGS_FIELDS) {
      if (field.kind === "boolean" || field.kind === "photo") continue;
      expect(screen.getByLabelText(field.label)).toHaveValue(SETTINGS[field.key] as string);
    }
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).toBeChecked();
    expect(hidden("atelier_photo_path")).toHaveValue(PHOTO);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(settingsFingerprint(SETTINGS));
    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    reported.mockRestore();
  });

  it("keeps the open form and what was typed in it when the row it reads is a newer one", async () => {
    server.createClient.mockResolvedValue(settingsTable(SETTINGS).client);
    const { rerender } = render(await SetariPage());
    const city = screen.getByLabelText("Localitatea");
    fireEvent.change(city, { target: { value: "Cluj-Napoca" } });

    server.createClient.mockResolvedValue(settingsTable({ ...SETTINGS, workshop_name: "Alt nume" }).client);
    rerender(await SetariPage());

    // The same input: another row is no reason to start over, and starting over would take her text.
    expect(screen.getByLabelText("Localitatea")).toBe(city);
    expect(city).toHaveValue("Cluj-Napoca");
    expect(screen.getByLabelText("Numele atelierului")).toHaveValue(SETTINGS.workshop_name);
    expect(hidden(SETTINGS_FINGERPRINT_FIELD)).toHaveValue(settingsFingerprint(SETTINGS));
  });
});

// The two halves of the fingerprint check, together: what the form does after a call without an
// answer, and what the action then makes of its retry. Each half is right by its own tests and
// the two still contradicted each other here once.
describe("SettingsForm over the real saveSettings", () => {
  it("answers „Salvat.” to the retry of a save whose answer was lost, and goes on saving from that tab", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const real = await vi.importActual<typeof import("@/actions/admin/save-settings")>("@/actions/admin/save-settings");
    const table = settingsTable(SETTINGS);
    server.createClient.mockResolvedValue(table.client);
    saveSettings.mockImplementation(real.saveSettings);
    // The first call reaches the server and is carried out; its answer is lost on the way back.
    saveSettings.mockImplementationOnce(async (prev, formData) => {
      await real.saveSettings(prev, formData);
      throw new TypeError("Failed to fetch");
    });
    render(<SettingsForm settings={SETTINGS} fingerprint={settingsFingerprint(SETTINGS)} />);
    const submit = screen.getByRole("button", { name: "Salvează" });
    fireEvent.change(screen.getByLabelText("Localitatea"), { target: { value: "Cluj-Napoca" } });

    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.noAnswer);
    expect(table.stored()?.city).toBe("Cluj-Napoca");

    // She tries again, as the notice says. The form still posts the fingerprint from before her
    // own save; the row holds what she posts, so it is a save like any other.
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");

    // With that answer the form stands on the row as it is: what she types next is saved too.
    fireEvent.change(screen.getByLabelText("Termen de execuție"), { target: { value: "5 săptămâni" } });
    fireEvent.click(submit);
    expect(await screen.findByText(ADMIN_MESSAGES.saved)).toHaveAttribute("role", "status");
    expect(table.stored()).toEqual({ ...SETTINGS, city: "Cluj-Napoca", lead_time: "5 săptămâni" });
    expect(saveSettings).toHaveBeenCalledTimes(3);
    reported.mockRestore();
  });
});
