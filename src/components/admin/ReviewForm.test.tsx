import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_MESSAGES } from "@/lib/admin/reviews";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";

// The Server Actions are replaced: the test drives the form, not the writes (src/actions/admin).
const saveReview = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-review", () => ({
  saveReview: (...args: [AdminActionState, FormData]) => saveReview(...args),
}));
const deleteReview = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/delete-review", () => ({
  deleteReview: (...args: [AdminActionState, FormData]) => deleteReview(...args),
}));

import { deleteReviewConfirmText } from "./DeleteReviewButton";
import { REVIEW_FORM_TEXTS, ReviewForm, type ReviewFormReview } from "./ReviewForm";

const REVIEW: ReviewFormReview = {
  id: "11111111-2222-4333-8444-555555555555",
  first_name: "Ana",
  city: "Cluj",
  body: "Patul a venit exact cum l-am configurat.",
  model_label: "Capitonat · 160 × 200",
  source: "google",
  consent: true,
  published: true,
  sort: 3,
};

const T = REVIEW_FORM_TEXTS;

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
}

beforeEach(() => {
  saveReview.mockReset();
  saveReview.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
  deleteReview.mockReset();
  // On success the real action redirects; here it simply resolves to the idle state.
  deleteReview.mockResolvedValue({ status: "idle" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReviewForm for a new review", () => {
  it("renders a labelled control for every column, with the defaults, and no delete", () => {
    render(<ReviewForm review={null} />);

    expect(hidden("id")).toHaveValue("");

    const firstName = screen.getByLabelText(T.firstName);
    expect(firstName).toHaveAttribute("name", "first_name");
    expect(firstName).toHaveAttribute("maxlength", "60");
    expect(firstName).toHaveValue("");
    expect(firstName).toHaveAccessibleDescription(T.firstNameHint);

    const city = screen.getByLabelText(T.city);
    expect(city).toHaveAttribute("name", "city");
    expect(city).toHaveAttribute("maxlength", "80");
    expect(city).toHaveValue("");

    const body = screen.getByLabelText(T.body);
    expect(body.tagName).toBe("TEXTAREA");
    expect(body).toHaveAttribute("name", "body");
    expect(body).toHaveAttribute("rows", "5");
    expect(body).toHaveAttribute("maxlength", "1000");
    expect(body).toHaveValue("");
    expect(body).toHaveAccessibleDescription(T.bodyHint);
    expect(body.closest("div")?.className).toContain("col-span-full");

    const model = screen.getByLabelText(T.modelLabel);
    expect(model).toHaveAttribute("name", "model_label");
    expect(model).toHaveAttribute("maxlength", "80");
    expect(model).toHaveAccessibleDescription(T.modelLabelHint);

    const source = screen.getByLabelText(T.source);
    expect(source.tagName).toBe("SELECT");
    expect(source).toHaveAttribute("name", "source");
    expect(source).toHaveValue("");
    expect(Array.from(source.querySelectorAll("option")).map((o) => [o.value, o.textContent])).toEqual([
      ["", "—"],
      ["google", "Google"],
      ["facebook", "Facebook"],
      ["whatsapp", "WhatsApp"],
      ["direct", "Direct, în atelier"],
    ]);

    const consent = screen.getByRole("checkbox", { name: T.consent });
    expect(consent).toHaveAttribute("name", "consent");
    expect(consent).not.toBeChecked();
    const published = screen.getByRole("checkbox", { name: T.published });
    expect(published).toHaveAttribute("name", "published");
    expect(published).not.toBeChecked();

    const sort = screen.getByLabelText(T.sort);
    expect(sort).toHaveAttribute("name", "sort");
    expect(sort).toHaveAttribute("type", "number");
    expect(sort).toHaveAttribute("min", "0");
    expect(sort).toHaveAttribute("max", "999");
    expect(sort).toHaveValue(0);

    const submit = screen.getByRole("button", { name: T.submit });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Șterge recenzia" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("posts every field to the action, keeps the typed values and shows the notice", async () => {
    render(<ReviewForm review={null} />);
    fireEvent.change(screen.getByLabelText(T.firstName), { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText(T.city), { target: { value: "Oradea" } });
    fireEvent.change(screen.getByLabelText(T.body), { target: { value: "Foarte mulțumită." } });
    fireEvent.change(screen.getByLabelText(T.modelLabel), { target: { value: "Arcuit · 180 × 200" } });
    fireEvent.change(screen.getByLabelText(T.source), { target: { value: "whatsapp" } });
    fireEvent.change(screen.getByLabelText(T.sort), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("checkbox", { name: T.consent }));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(saveReview).toHaveBeenCalledTimes(1));
    const formData = saveReview.mock.calls[0][1];
    expect(formData.get("id")).toBe("");
    expect(formData.get("first_name")).toBe("Maria");
    expect(formData.get("city")).toBe("Oradea");
    expect(formData.get("body")).toBe("Foarte mulțumită.");
    expect(formData.get("model_label")).toBe("Arcuit · 180 × 200");
    expect(formData.get("source")).toBe("whatsapp");
    expect(formData.get("sort")).toBe("4");
    expect(formData.get("consent")).toBe("on");
    expect(formData.get("published")).toBeNull();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(screen.getByLabelText(T.firstName)).toHaveValue("Maria");
    expect(screen.getByLabelText(T.body)).toHaveValue("Foarte mulțumită.");
    expect(screen.getByLabelText(T.source)).toHaveValue("whatsapp");
    expect(screen.getByRole("button", { name: T.submit })).toBeEnabled();
  });

  it("posts an empty source for „—”", async () => {
    render(<ReviewForm review={null} />);
    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    await waitFor(() => expect(saveReview).toHaveBeenCalledTimes(1));
    expect(saveReview.mock.calls[0][1].get("source")).toBe("");
  });

  it("shows the server's message and field errors, and focuses the first invalid field in form order", async () => {
    saveReview.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { body: ADMIN_MESSAGES.required, first_name: ADMIN_MESSAGES.required, sort: ADMIN_MESSAGES.invalid },
    });
    render(<ReviewForm review={null} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");

    const firstName = screen.getByLabelText(T.firstName);
    expect(firstName).toHaveAttribute("aria-invalid", "true");
    expect(firstName).toHaveAccessibleDescription(`${T.firstNameHint} ${ADMIN_MESSAGES.required}`);
    const body = screen.getByLabelText(T.body);
    expect(body).toHaveAttribute("aria-invalid", "true");
    expect(body).toHaveAccessibleDescription(`${T.bodyHint} ${ADMIN_MESSAGES.required}`);
    expect(screen.getByLabelText(T.sort)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(T.city)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText(T.source)).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(document.activeElement).toBe(firstName));
  });

  it("marks the published checkbox when the server refuses to publish without consent", async () => {
    saveReview.mockResolvedValue({
      status: "error",
      message: REVIEW_MESSAGES.consent,
      fieldErrors: { published: REVIEW_MESSAGES.consent },
    });
    render(<ReviewForm review={null} />);
    fireEvent.click(screen.getByRole("checkbox", { name: T.published }));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(REVIEW_MESSAGES.consent);
    const published = screen.getByRole("checkbox", { name: T.published });
    expect(published).toHaveAttribute("aria-invalid", "true");
    expect(published).toHaveAccessibleDescription(REVIEW_MESSAGES.consent);
    expect(published).toBeChecked();
    expect(screen.getByRole("checkbox", { name: T.consent })).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(document.activeElement).toBe(published));
  });
});

describe("ReviewForm for an existing review", () => {
  it("fills the values and offers the delete in its own form", () => {
    render(<ReviewForm review={REVIEW} />);

    expect(hidden("id")).toHaveValue(REVIEW.id);
    expect(screen.getByLabelText(T.firstName)).toHaveValue("Ana");
    expect(screen.getByLabelText(T.city)).toHaveValue("Cluj");
    expect(screen.getByLabelText(T.body)).toHaveValue("Patul a venit exact cum l-am configurat.");
    expect(screen.getByLabelText(T.modelLabel)).toHaveValue("Capitonat · 160 × 200");
    expect(screen.getByLabelText(T.source)).toHaveValue("google");
    expect(screen.getByRole("checkbox", { name: T.consent })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: T.published })).toBeChecked();
    expect(screen.getByLabelText(T.sort)).toHaveValue(3);

    const remove = screen.getByRole("button", { name: "Șterge recenzia" });
    expect(remove).toHaveAttribute("type", "submit");
    expect(remove.className).toContain("border-ink");
    // The delete is its own form, never nested in the edit form.
    expect(remove.closest("form")).not.toBe(screen.getByRole("button", { name: T.submit }).closest("form"));
    expect(remove.closest("form")?.querySelector('input[name="id"]')).toHaveValue(REVIEW.id);
  });

  it("shows empty controls for null columns", () => {
    render(<ReviewForm review={{ ...REVIEW, city: null, model_label: null, source: null }} />);
    expect(screen.getByLabelText(T.city)).toHaveValue("");
    expect(screen.getByLabelText(T.modelLabel)).toHaveValue("");
    expect(screen.getByLabelText(T.source)).toHaveValue("");
  });

  it("posts the id with the edited values", async () => {
    render(<ReviewForm review={REVIEW} />);
    fireEvent.change(screen.getByLabelText(T.body), { target: { value: "Text corectat." } });
    fireEvent.click(screen.getByRole("checkbox", { name: T.published }));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(saveReview).toHaveBeenCalledTimes(1));
    const formData = saveReview.mock.calls[0][1];
    expect(formData.get("id")).toBe(REVIEW.id);
    expect(formData.get("first_name")).toBe("Ana");
    expect(formData.get("body")).toBe("Text corectat.");
    expect(formData.get("consent")).toBe("on");
    expect(formData.get("published")).toBeNull();
    expect(formData.get("sort")).toBe("3");
    expect(await screen.findByRole("status")).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(screen.getByLabelText(T.body)).toHaveValue("Text corectat.");
  });

  it("shows a plain error without field errors", async () => {
    saveReview.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<ReviewForm review={REVIEW} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(screen.getByLabelText(T.firstName)).not.toHaveAttribute("aria-invalid");
  });
});

describe("DeleteReviewButton", () => {
  it("asks for confirmation with the name and the city, and does nothing when declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ReviewForm review={REVIEW} />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge recenzia" }));

    expect(confirm).toHaveBeenCalledWith(deleteReviewConfirmText("Ana, Cluj"));
    expect(confirm).toHaveBeenCalledWith("Ștergi definitiv recenzia de la Ana, Cluj?");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteReview).not.toHaveBeenCalled();
  });

  it("names the review by the first name alone when there is no city", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ReviewForm review={{ ...REVIEW, city: null }} />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge recenzia" }));

    expect(window.confirm).toHaveBeenCalledWith("Ștergi definitiv recenzia de la Ana?");
  });

  it("posts the id to the delete action once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ReviewForm review={REVIEW} />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge recenzia" }));

    await waitFor(() => expect(deleteReview).toHaveBeenCalledTimes(1));
    expect(deleteReview.mock.calls[0][1].get("id")).toBe(REVIEW.id);
    expect(saveReview).not.toHaveBeenCalled();
  });

  it("shows the action's error in an alert and keeps the button", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteReview.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.forbidden });
    render(<ReviewForm review={REVIEW} />);

    fireEvent.click(screen.getByRole("button", { name: "Șterge recenzia" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.forbidden);
    expect(alert.className).toContain("border-error");
    expect(screen.getByRole("button", { name: "Șterge recenzia" })).toBeEnabled();
  });
});
