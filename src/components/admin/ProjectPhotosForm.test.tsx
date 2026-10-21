import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { NEW_PHOTO_ALT_FIELD, PHOTO_ROW_ID_FIELD, photoRowFields, PROJECT_MESSAGES } from "@/lib/admin/projects";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import type { PhotoFieldProps } from "./PhotoField";

// The Server Action is replaced: the test drives the form, not the writes (src/actions/admin).
const saveProjectPhotos = vi.fn<(prev: AdminActionState, formData: FormData) => Promise<AdminActionState>>();
vi.mock("@/actions/admin/save-project-photos", () => ({
  saveProjectPhotos: (...args: [AdminActionState, FormData]) => saveProjectPhotos(...args),
}));

const PROJECT_ID = "9a1b2c3d-0000-4000-8000-00000000abcd";
const UPLOADED = `projects/${PROJECT_ID}-1792569600000.webp`;

// PhotoField has its own test; here a stub posts the hidden inputs it would, lets the
// test flip the uploading state the form must honour and "finish" an upload with a path.
const photoProps = vi.fn<(props: PhotoFieldProps) => void>();
vi.mock("@/components/admin/PhotoField", () => ({
  PhotoField: (props: PhotoFieldProps) => {
    photoProps(props);
    const [path, setPath] = useState(props.currentPath ?? "");
    return (
      <div>
        <label htmlFor={props.id}>{props.label}</label>
        <input id={props.id} type="file" aria-invalid={props.error ? "true" : undefined} />
        <input type="hidden" name={PHOTO_FIELDS.path} value={path} />
        <input type="hidden" name={PHOTO_FIELDS.before} value={props.currentPath ?? ""} />
        <p>{props.hint}</p>
        {props.error && <p>{props.error}</p>}
        <button type="button" onClick={() => props.onUploadingChange?.(true)}>
          start upload
        </button>
        <button
          type="button"
          onClick={() => {
            setPath(UPLOADED);
            props.onUploadingChange?.(false);
          }}
        >
          end upload
        </button>
      </div>
    );
  },
}));

import { PROJECT_PHOTOS_TEXTS, ProjectPhotosForm, type ProjectPhotosFormPhoto } from "./ProjectPhotosForm";

const PHOTO_A: ProjectPhotosFormPhoto = { id: "3f2b1c4d-0000-4000-8000-000000000001", path: `projects/${PROJECT_ID}-1792569508760.webp`, alt: "Patul din față", sort: 0 };
const PHOTO_B: ProjectPhotosFormPhoto = { id: "3f2b1c4d-0000-4000-8000-000000000002", path: `projects/${PROJECT_ID}-1792569508761.webp`, alt: "Detaliu tăblie", sort: 2 };

const T = PROJECT_PHOTOS_TEXTS;

function hidden(name: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`));
}

beforeEach(() => {
  saveProjectPhotos.mockReset();
  saveProjectPhotos.mockResolvedValue({ status: "ok", message: ADMIN_MESSAGES.saved });
  photoProps.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ProjectPhotosForm", () => {
  it("renders the rows ordered by sort with their values, thumbnails and delete boxes, and the new-photo field of the projects folder", () => {
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_B, PHOTO_A]} />);

    expect(hidden("project_id").map((input) => input.value)).toEqual([PROJECT_ID]);
    expect(hidden(PHOTO_ROW_ID_FIELD).map((input) => input.value)).toEqual([PHOTO_A.id, PHOTO_B.id]);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const images = document.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", `https://example.supabase.co/storage/v1/object/public/media/${PHOTO_A.path}`);
    expect(images[0]).toHaveAttribute("alt", "");
    expect(images[1]).toHaveAttribute("src", `https://example.supabase.co/storage/v1/object/public/media/${PHOTO_B.path}`);

    const alts = screen.getAllByLabelText(T.alt);
    expect(alts.map((input) => input.getAttribute("name"))).toEqual([photoRowFields(PHOTO_A.id).alt, photoRowFields(PHOTO_B.id).alt]);
    expect(alts[0]).toHaveValue("Patul din față");
    expect(alts[0]).toBeRequired();
    expect(alts[0]).toHaveAttribute("maxlength", "200");
    expect(alts[1]).toHaveValue("Detaliu tăblie");

    const sorts = screen.getAllByLabelText(T.sort);
    expect(sorts.map((input) => input.getAttribute("name"))).toEqual([photoRowFields(PHOTO_A.id).sort, photoRowFields(PHOTO_B.id).sort]);
    expect(sorts[0]).toHaveAttribute("type", "number");
    expect(sorts[0]).toHaveValue(0);
    expect(sorts[1]).toHaveValue(2);

    const deletes = screen.getAllByRole("checkbox", { name: T.delete });
    expect(deletes.map((input) => input.getAttribute("name"))).toEqual([photoRowFields(PHOTO_A.id).delete, photoRowFields(PHOTO_B.id).delete]);
    expect(deletes[0]).not.toBeChecked();

    expect(screen.getByRole("heading", { level: 3, name: T.add })).toBeInTheDocument();
    expect(photoProps).toHaveBeenCalledWith(
      expect.objectContaining({ folder: "projects", slug: PROJECT_ID, currentPath: null, ratio: "4:3", label: T.newPhoto, hint: T.newPhotoHint }),
    );
    expect(screen.getByLabelText(T.newPhoto)).toBeInTheDocument();
    const newAlt = screen.getByLabelText(T.newAlt);
    expect(newAlt).toHaveAttribute("name", NEW_PHOTO_ALT_FIELD);
    expect(newAlt).toHaveAttribute("maxlength", "200");
    expect(newAlt).toHaveAccessibleDescription(T.newAltHint);
    expect(newAlt).toHaveValue("");

    const submit = screen.getByRole("button", { name: T.submit });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeEnabled();
    expect(screen.queryByText(T.empty)).toBeNull();
  });

  it("shows the empty state for a project without photos, with the new-photo field still there", () => {
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[]} />);
    expect(screen.getByText(T.empty)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByLabelText(T.newPhoto)).toBeInTheDocument();
    expect(screen.getByLabelText(T.newAlt)).toBeInTheDocument();
  });

  it("posts the project id, every row's alt and sort, and a ticked delete box", async () => {
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_A, PHOTO_B]} />);
    const [altA] = screen.getAllByLabelText(T.alt);
    const [, sortB] = screen.getAllByLabelText(T.sort);
    fireEvent.change(altA, { target: { value: "Patul, din față" } });
    fireEvent.change(sortB, { target: { value: "1" } });
    fireEvent.click(screen.getAllByRole("checkbox", { name: T.delete })[1]);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(saveProjectPhotos).toHaveBeenCalledTimes(1));
    const formData = saveProjectPhotos.mock.calls[0][1];
    expect(formData.get("project_id")).toBe(PROJECT_ID);
    expect(formData.getAll(PHOTO_ROW_ID_FIELD)).toEqual([PHOTO_A.id, PHOTO_B.id]);
    expect(formData.get(photoRowFields(PHOTO_A.id).alt)).toBe("Patul, din față");
    expect(formData.get(photoRowFields(PHOTO_A.id).sort)).toBe("0");
    expect(formData.get(photoRowFields(PHOTO_A.id).delete)).toBeNull();
    expect(formData.get(photoRowFields(PHOTO_B.id).alt)).toBe("Detaliu tăblie");
    expect(formData.get(photoRowFields(PHOTO_B.id).sort)).toBe("1");
    expect(formData.get(photoRowFields(PHOTO_B.id).delete)).toBe("on");
    expect(formData.get(PHOTO_FIELDS.path)).toBe("");
    expect(formData.get(PHOTO_FIELDS.before)).toBe("");
    expect(formData.get(NEW_PHOTO_ALT_FIELD)).toBe("");

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(ADMIN_MESSAGES.saved);
    expect(notice.className).toContain("border-accent");
    expect(altA).toHaveValue("Patul, din față");
  });

  it("holds the submit while a photo is uploading, then posts the uploaded path with its alt", async () => {
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_A]} />);
    const submit = screen.getByRole("button", { name: T.submit });

    fireEvent.click(screen.getByRole("button", { name: "start upload" }));
    expect(submit).toBeDisabled();
    // A scripted submit during the upload must not reach the action either.
    fireEvent.submit(submit.closest("form")!);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveProjectPhotos).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "end upload" }));
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText(T.newAlt), { target: { value: "Patul în cameră" } });

    fireEvent.click(submit);

    await waitFor(() => expect(saveProjectPhotos).toHaveBeenCalledTimes(1));
    const formData = saveProjectPhotos.mock.calls[0][1];
    expect(formData.get(PHOTO_FIELDS.path)).toBe(UPLOADED);
    expect(formData.get(PHOTO_FIELDS.before)).toBe("");
    expect(formData.get(NEW_PHOTO_ALT_FIELD)).toBe("Patul în cameră");
  });

  it("resets the new-photo block after a successful save, so the next submit posts no path", async () => {
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "end upload" }));
    fireEvent.change(screen.getByLabelText(T.newAlt), { target: { value: "Patul în cameră" } });
    const [altA] = screen.getAllByLabelText(T.alt);
    fireEvent.change(altA, { target: { value: "Patul, din față" } });

    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    await waitFor(() => expect(saveProjectPhotos).toHaveBeenCalledTimes(1));
    expect(saveProjectPhotos.mock.calls[0][1].get(PHOTO_FIELDS.path)).toBe(UPLOADED);
    await screen.findByRole("status");

    // The uploaded path and its alt are gone; the rows keep what the admin typed.
    expect(hidden(PHOTO_FIELDS.path).map((input) => input.value)).toEqual([""]);
    expect(screen.getByLabelText(T.newAlt)).toHaveValue("");
    expect(altA).toHaveValue("Patul, din față");

    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    await waitFor(() => expect(saveProjectPhotos).toHaveBeenCalledTimes(2));
    const second = saveProjectPhotos.mock.calls[1][1];
    expect(second.get(PHOTO_FIELDS.path)).toBe("");
    expect(second.get(NEW_PHOTO_ALT_FIELD)).toBe("");
    expect(second.get(photoRowFields(PHOTO_A.id).alt)).toBe("Patul, din față");
  });

  it("keeps the uploaded path and its alt after a save with errors, so the admin only fixes the field", async () => {
    saveProjectPhotos.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: { [NEW_PHOTO_ALT_FIELD]: PROJECT_MESSAGES.photos } });
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_A]} />);
    fireEvent.click(screen.getByRole("button", { name: "end upload" }));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    await screen.findByRole("alert");

    expect(hidden(PHOTO_FIELDS.path).map((input) => input.value)).toEqual([UPLOADED]);
    fireEvent.change(screen.getByLabelText(T.newAlt), { target: { value: "Patul în cameră" } });
    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    await waitFor(() => expect(saveProjectPhotos).toHaveBeenCalledTimes(2));
    expect(saveProjectPhotos.mock.calls[1][1].get(PHOTO_FIELDS.path)).toBe(UPLOADED);
    expect(saveProjectPhotos.mock.calls[1][1].get(NEW_PHOTO_ALT_FIELD)).toBe("Patul în cameră");
  });

  it("does not move the focus when the page re-renders the same errors with a new photos array", async () => {
    saveProjectPhotos.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { [photoRowFields(PHOTO_B.id).alt]: PROJECT_MESSAGES.photos },
    });
    const { rerender } = render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_A, PHOTO_B]} />);
    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    const [altA, altB] = screen.getAllByLabelText(T.alt);
    await waitFor(() => expect(document.activeElement).toBe(altB));

    altA.focus();
    // What a refresh() from the project's own form above does: new row objects, same content.
    rerender(<ProjectPhotosForm projectId={PROJECT_ID} photos={[{ ...PHOTO_A }, { ...PHOTO_B }]} />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(altA);
    expect(altB).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the server's message and marks the right row, the new photo and its alt, focusing the first invalid field", async () => {
    saveProjectPhotos.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: {
        [NEW_PHOTO_ALT_FIELD]: PROJECT_MESSAGES.photos,
        [PHOTO_FIELDS.path]: ADMIN_MESSAGES.invalid,
        [photoRowFields(PHOTO_B.id).alt]: PROJECT_MESSAGES.photos,
        [photoRowFields(PHOTO_B.id).sort]: ADMIN_MESSAGES.invalid,
      },
    });
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_A, PHOTO_B]} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.invalid);
    expect(alert.className).toContain("border-error");

    const [altA, altB] = screen.getAllByLabelText(T.alt);
    expect(altA).not.toHaveAttribute("aria-invalid");
    expect(altB).toHaveAttribute("aria-invalid", "true");
    expect(altB).toHaveAccessibleDescription(PROJECT_MESSAGES.photos);
    const [sortA, sortB] = screen.getAllByLabelText(T.sort);
    expect(sortA).not.toHaveAttribute("aria-invalid");
    expect(sortB).toHaveAttribute("aria-invalid", "true");
    expect(sortB).toHaveAccessibleDescription(ADMIN_MESSAGES.invalid);
    expect(photoProps).toHaveBeenLastCalledWith(expect.objectContaining({ error: ADMIN_MESSAGES.invalid }));
    const newAlt = screen.getByLabelText(T.newAlt);
    expect(newAlt).toHaveAttribute("aria-invalid", "true");
    expect(newAlt).toHaveAccessibleDescription(`${T.newAltHint} ${PROJECT_MESSAGES.photos}`);
    await waitFor(() => expect(document.activeElement).toBe(altB));
  });

  it("shows a plain error without field errors", async () => {
    saveProjectPhotos.mockResolvedValue({ status: "error", message: ADMIN_MESSAGES.notFound });
    render(<ProjectPhotosForm projectId={PROJECT_ID} photos={[PHOTO_A]} />);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.notFound);
    expect(screen.getAllByLabelText(T.alt)[0]).not.toHaveAttribute("aria-invalid");
  });
});
