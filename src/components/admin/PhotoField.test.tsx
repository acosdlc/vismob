import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEDIA_UPLOAD, PHOTO_FIELDS } from "@/lib/admin/media";
import { ADMIN_MESSAGES } from "@/lib/admin/types";

const upload = vi.fn();
const createClient = vi.fn(() => ({ storage: { from: () => ({ upload }) } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => createClient() }));
// jsdom has no canvas: compression is the identity here, a file named "broken.*" cannot be
// decoded, and one named "camera.*" comes out small, as the real resize leaves a camera's original.
vi.mock("browser-image-compression", () => ({
  default: async (file: File) => {
    if (file.name.startsWith("broken.")) throw new Error("cannot decode");
    if (file.name.startsWith("camera.")) return new File([new Uint8Array(300 * 1024)], file.name, { type: "image/webp" });
    return file;
  },
}));

import { PhotoField, PHOTO_TEXTS } from "./PhotoField";

const CURRENT = "materials/ct-verde-1792569508760.webp";

function hidden(container: HTMLElement, name: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
}

function pick(name = "poza.jpg", bytes = 10) {
  const input = screen.getByLabelText("Poză") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(bytes)], name, { type: "image/jpeg" })] } });
  return input;
}

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ data: {}, error: null });
  createClient.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
});

describe("PhotoField", () => {
  it("posts the current path in both hidden inputs and shows the photo", () => {
    const { container } = render(<PhotoField folder="materials" slug="ct-verde" currentPath={CURRENT} label="Poză" hint="Pătrată." />);
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe(CURRENT);
    expect(hidden(container, PHOTO_FIELDS.before).value).toBe(CURRENT);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `https://example.supabase.co/storage/v1/object/public/media/materials/ct-verde-1792569508760.webp`,
    );
    expect(screen.getByLabelText("Poză")).toHaveAttribute("aria-describedby", expect.stringContaining("-hint"));
    expect(screen.getByText("Pătrată.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PHOTO_TEXTS.remove })).toBeInTheDocument();
  });

  it("uploads a resized photo under a new name and posts that path", async () => {
    const onUploadingChange = vi.fn();
    const { container } = render(
      <PhotoField folder="materials" slug="ct-verde" currentPath={CURRENT} label="Poză" onUploadingChange={onUploadingChange} />,
    );
    pick();
    expect(onUploadingChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, file, options] = upload.mock.calls[0];
    expect(path).toMatch(/^materials\/ct-verde-\d{13}\.webp$/);
    expect(path).not.toBe(CURRENT);
    expect(file).toBeInstanceOf(File);
    expect(options).toMatchObject({ contentType: "image/webp", upsert: false });
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe(path);
    expect(hidden(container, PHOTO_FIELDS.before).value).toBe(CURRENT);
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);
  });

  it("clears the path on „Șterge poza” and keeps the loaded path for the action to remove", () => {
    const { container } = render(<PhotoField folder="bases" slug="lemn" currentPath="bases/lemn-1792569508760.webp" label="Poză" ratio="4:3" />);
    fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe("");
    expect(hidden(container, PHOTO_FIELDS.before).value).toBe("bases/lemn-1792569508760.webp");
    expect(screen.getByText(PHOTO_TEXTS.removed)).toBeInTheDocument();
    expect(screen.getByText(PHOTO_TEXTS.none)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PHOTO_TEXTS.remove })).not.toBeInTheDocument();
  });

  it("reports a failed upload, an undecodable file and a missing service, and keeps the old path", async () => {
    upload.mockResolvedValueOnce({ data: null, error: { message: "new row violates row-level security policy" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<PhotoField folder="materials" slug="x" currentPath={CURRENT} label="Poză" />);
    pick();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PHOTO_TEXTS.failed));
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe(CURRENT);

    pick("broken.jpg");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PHOTO_TEXTS.undecodable));
    expect(upload).toHaveBeenCalledTimes(1);

    createClient.mockImplementationOnce(() => {
      throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    });
    pick();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.unavailable));
    // Only the first pick reached the bucket: the others stopped before the upload.
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("measures the photo after the resize: an original over the limit that shrinks under it is uploaded", async () => {
    const { container } = render(<PhotoField folder="projects" slug="x" currentPath={null} label="Poză" />);

    // A camera's original, 14 MB: the bucket's limit is on what is stored, and only the resized file goes there.
    pick("camera.jpg", 14 * 1024 * 1024);

    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, file] = upload.mock.calls[0];
    expect((file as File).size).toBe(300 * 1024);
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe(path);
  });

  it("refuses a photo still over the limit after the resize, with a message that names the limit, and uploads nothing", async () => {
    const onUploadingChange = vi.fn();
    const { container } = render(
      <PhotoField folder="materials" slug="x" currentPath={CURRENT} label="Poză" onUploadingChange={onUploadingChange} />,
    );

    // The identity "resize" of this test leaves it over the limit.
    pick("huge.jpg", MEDIA_UPLOAD.maxBytes + 1);

    // „Încearcă din nou” can never work for this file: the message says what is wrong with it.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Poza are peste 10 MB. Alege un fișier mai mic.");
    expect(alert.textContent).toBe(PHOTO_TEXTS.tooLarge);
    // The number follows the limit the check uses.
    expect(PHOTO_TEXTS.tooLarge).toContain(` ${MEDIA_UPLOAD.maxBytes / (1024 * 1024)} MB`);
    expect(upload).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    // The resize ran, so the form's submit was held; the refusal gives it back.
    expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe(CURRENT);
  });

  it("uploads a resized photo of exactly the limit: only one over it is refused", async () => {
    render(<PhotoField folder="materials" slug="x" currentPath={null} label="Poză" />);

    pick("limit.jpg", MEDIA_UPLOAD.maxBytes);

    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("answers an original over the limit that cannot be decoded with the unreadable-file message, not with the limit", async () => {
    render(<PhotoField folder="materials" slug="x" currentPath={CURRENT} label="Poză" />);

    pick("broken.jpg", MEDIA_UPLOAD.maxBytes + 1);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PHOTO_TEXTS.undecodable));
    expect(upload).not.toHaveBeenCalled();
  });

  it("drops „…apare pe site după ce salvezi” once the stored path is the uploaded one, and keeps it until then", async () => {
    const field = (currentPath: string | null) => <PhotoField folder="materials" slug="ct-verde" currentPath={currentPath} label="Poză" />;
    const { container, rerender } = render(field(CURRENT));
    pick();
    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    const first = hidden(container, PHOTO_FIELDS.path).value;

    // A refused save, or a save still on its way: the row holds the old photo, the sentence still has something to say.
    rerender(field(CURRENT));
    expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument();

    // The save went through and the page hands the stored path back: nothing is left to save.
    rerender(field(first));
    expect(screen.queryByText(PHOTO_TEXTS.uploaded)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe(first);
    expect(hidden(container, PHOTO_FIELDS.before).value).toBe(first);
    expect(container.querySelector("img")?.getAttribute("src")).toContain(first);

    // A second photo is not the stored one yet: its sentence shows, whatever was saved before it.
    await new Promise((resolve) => setTimeout(resolve, 5));
    pick();
    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    const second = hidden(container, PHOTO_FIELDS.path).value;
    expect(second).not.toBe(first);
    rerender(field(first));
    expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument();
    rerender(field(second));
    expect(screen.queryByText(PHOTO_TEXTS.uploaded)).toBeNull();
  });

  it("drops „Poza se șterge când salvezi.” once the stored photo is gone, and keeps it until then", () => {
    const field = (currentPath: string | null) => <PhotoField folder="bases" slug="lemn" currentPath={currentPath} label="Poză" ratio="4:3" />;
    const { container, rerender } = render(field("bases/lemn-1792569508760.webp"));
    fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
    expect(screen.getByText(PHOTO_TEXTS.removed)).toBeInTheDocument();

    rerender(field("bases/lemn-1792569508760.webp"));
    expect(screen.getByText(PHOTO_TEXTS.removed)).toBeInTheDocument();

    rerender(field(null));
    expect(screen.queryByText(PHOTO_TEXTS.removed)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(hidden(container, PHOTO_FIELDS.path).value).toBe("");
    expect(hidden(container, PHOTO_FIELDS.before).value).toBe("");
    expect(screen.getByText(PHOTO_TEXTS.none)).toBeInTheDocument();
  });

  it("keeps an error on screen whatever the stored path is: it speaks of the file, not of the save", async () => {
    upload.mockResolvedValueOnce({ data: null, error: { message: "new row violates row-level security policy" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const field = (currentPath: string | null) => <PhotoField folder="materials" slug="x" currentPath={currentPath} label="Poză" />;
    const { rerender } = render(field(CURRENT));
    pick();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PHOTO_TEXTS.failed));

    // The field still holds the stored path, and a save of the other fields hands the same one back.
    rerender(field(CURRENT));
    expect(screen.getByRole("alert")).toHaveTextContent(PHOTO_TEXTS.failed);
  });

  it("reports „Șterge poza” through onRemove: a click sends the form no change event, a pick does", async () => {
    const onRemove = vi.fn();
    const onFormChange = vi.fn();
    render(
      <form onChange={onFormChange}>
        <PhotoField folder="bases" slug="lemn" currentPath="bases/lemn-1792569508760.webp" label="Poză" onRemove={onRemove} />
      </form>,
    );
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onFormChange).not.toHaveBeenCalled();

    // A picked file reaches the form by itself, so it needs no callback.
    pick();
    expect(onFormChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("posts under custom input names when given", () => {
    const { container } = render(
      <PhotoField
        folder="site"
        slug="atelier"
        currentPath="site/atelier-1792569508760.webp"
        label="Poză"
        names={{ path: "atelier_photo_path", before: "atelier_photo_path_before" }}
      />,
    );
    expect(hidden(container, "atelier_photo_path").value).toBe("site/atelier-1792569508760.webp");
    expect(hidden(container, "atelier_photo_path_before").value).toBe("site/atelier-1792569508760.webp");
    expect(container.querySelector(`input[name="${PHOTO_FIELDS.path}"]`)).toBeNull();
  });

  it("is inert while disabled: no picking, no removing, and the two hidden inputs still post", () => {
    const { container } = render(
      <form>
        <PhotoField folder="materials" slug="x" currentPath={CURRENT} label="Poză" disabled />
      </form>,
    );
    expect(screen.getByLabelText("Poză")).toBeDisabled();
    expect(screen.queryByRole("button", { name: PHOTO_TEXTS.remove })).not.toBeInTheDocument();
    // A disabled control is left out of a form's post; these two are not disabled.
    const posted = new FormData(container.querySelector("form")!);
    expect(posted.get(PHOTO_FIELDS.path)).toBe(CURRENT);
    expect(posted.get(PHOTO_FIELDS.before)).toBe(CURRENT);
  });

  it("renders a server-side error under the field", () => {
    render(<PhotoField folder="materials" slug="x" currentPath={null} label="Poză" error="Poza nu e validă." />);
    expect(screen.getByLabelText("Poză")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Poza nu e validă.")).toBeInTheDocument();
  });
});
