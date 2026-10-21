import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_FIELDS, SETTINGS_GROUPS } from "@/lib/admin/settings-fields";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";

// The Server Action is replaced: the test drives the form, not the write (src/actions/admin).
const saveSettings = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-settings", () => ({
  saveSettings: (...args: [AdminActionState, FormData]) => saveSettings(...args),
}));

import { SettingsForm } from "./SettingsForm";

const SETTINGS: Settings = {
  ...SEED_SETTINGS,
  workshop_name: "Atelierul",
  whatsapp_number: "40722123456",
  instagram_url: "https://www.instagram.com/atelier",
  show_prices: true,
};

beforeEach(() => {
  saveSettings.mockReset();
  saveSettings.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
});

describe("SettingsForm", () => {
  it("renders a labelled control for every Settings key, grouped as the seed, with the current values", () => {
    render(<SettingsForm settings={SETTINGS} />);

    for (const group of SETTINGS_GROUPS) {
      expect(screen.getByRole("heading", { level: 2, name: group.title })).toBeInTheDocument();
    }

    for (const field of SETTINGS_FIELDS) {
      const control = screen.getByLabelText(field.label);
      expect(control).toHaveAttribute("name", field.key);
      if (field.kind === "boolean") {
        expect(control).toHaveAttribute("type", "checkbox");
      } else {
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

  it("reflects show_prices in the checkbox", () => {
    const { unmount } = render(<SettingsForm settings={SETTINGS} />);
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).toBeChecked();
    unmount();

    render(<SettingsForm settings={{ ...SETTINGS, show_prices: false }} />);
    expect(screen.getByRole("checkbox", { name: "Arată prețurile orientative pe site" })).not.toBeChecked();
  });

  it("submits every field to the action and shows the saved notice, keeping the typed values", async () => {
    render(<SettingsForm settings={SETTINGS} />);
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

  it("shows the server's message and field errors, and focuses the first invalid field", async () => {
    saveSettings.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { whatsapp_number: "Scrie numărul internațional, doar cifre, fără +", instagram_url: "Scrie un link complet, cu https://" },
    });
    render(<SettingsForm settings={SETTINGS} />);

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
    render(<SettingsForm settings={SETTINGS} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    for (const field of SETTINGS_FIELDS) expect(screen.getByLabelText(field.label)).not.toHaveAttribute("aria-invalid");
  });

  it("locks the save when the page could not read the saved row, keeping the fields visible", async () => {
    render(<SettingsForm settings={SEED_SETTINGS} locked />);

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
