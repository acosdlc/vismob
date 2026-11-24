import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEDIA_UPLOAD, PHOTO_FIELDS } from "@/lib/admin/media";
import { ADMIN_MESSAGES } from "@/lib/admin/types";

const upload = vi.fn();
const remove = vi.fn();
const createClient = vi.fn(() => ({ storage: { from: () => ({ upload, remove }) } }));
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

/**
 * What `upload()` hands back as `error` when it fails. The three answers of Storage are the
 * objects the app's own storage-js built against a real Storage API (a local Supabase stack),
 * field for field; the others follow how storage-js builds an error (a StorageUnknownError
 * without a status when no answer came, the HTTP status when the answer has no Storage body).
 */
const STORAGE_ERRORS = {
  /** No session: the request runs as `anon` and the policy admin_all_media refuses the insert (a signed-in account without the admin role gets the same answer). */
  sessionGone: { name: "StorageApiError", message: "new row violates row-level security policy", status: 400, statusCode: "403", code: "AccessDenied" },
  tokenRefused: { name: "StorageApiError", message: '"exp" claim timestamp check failed', status: 400, statusCode: "403", code: "AccessDenied" },
  nameTaken: { name: "StorageApiError", message: "The resource already exists", status: 400, statusCode: "409", code: "KeyAlreadyExists" },
  /** No answer at all. */
  unreachable: { name: "StorageUnknownError", message: "Failed to fetch" },
  /** A gateway that turns the key away before Storage sees the request. */
  gateway401: { name: "StorageApiError", message: "Invalid API key", status: 401, statusCode: "401" },
  gateway403: { name: "StorageApiError", message: "Forbidden", status: 403, statusCode: "403" },
} as const;

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
  remove.mockReset().mockResolvedValue({ data: [], error: null });
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
    upload.mockResolvedValueOnce({ data: null, error: STORAGE_ERRORS.unreachable });
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
    upload.mockResolvedValueOnce({ data: null, error: STORAGE_ERRORS.unreachable });
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

  it("stores a photo with a one-hour cache lifetime, so the copies of a deleted photo run out within hours, not within a year", async () => {
    render(<PhotoField folder="projects" slug="x" currentPath={null} label="Poză" />);
    pick();
    await waitFor(() => expect(screen.getByText(PHOTO_TEXTS.uploaded)).toBeInTheDocument());
    const [, , options] = upload.mock.calls[0];
    // next/image keeps every optimized copy for the larger of images.minimumCacheTTL (Next's
    // default, 4 hours) and the lifetime the bucket answers with; nothing removes those copies
    // when the photo is deleted. "31536000" made that a year after the photo itself was gone.
    expect(options.cacheControl).toBe("3600");
  });

  // The upload goes from the browser straight to Storage, so no Server Action is there to check
  // the session and answer ADMIN_MESSAGES.forbidden: the field reads the refusal itself.
  describe("an upload Storage refuses because of who is asking", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    it("tells her to sign in again when the session is gone, with the text the saves give, not „Încearcă din nou”", async () => {
      upload.mockResolvedValueOnce({ data: null, error: STORAGE_ERRORS.sessionGone });
      const onUploadingChange = vi.fn();
      const { container } = render(
        <PhotoField folder="materials" slug="ct-verde" currentPath={CURRENT} label="Poză" onUploadingChange={onUploadingChange} />,
      );

      pick();

      // Trying again can never work without a session: the field says what does.
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("Sesiunea a expirat sau nu ai acces. Intră din nou în cont.");
      expect(alert.textContent).toBe(ADMIN_MESSAGES.forbidden);
      expect(screen.queryByText(PHOTO_TEXTS.failed)).toBeNull();
      // The field keeps the photo it had and gives the submit back.
      expect(hidden(container, PHOTO_FIELDS.path).value).toBe(CURRENT);
      expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
    });

    it.each([
      ["a token Storage no longer accepts", STORAGE_ERRORS.tokenRefused],
      ["a gateway that answers 401", STORAGE_ERRORS.gateway401],
      ["a gateway that answers 403", STORAGE_ERRORS.gateway403],
    ])("gives the same text for %s", async (_case, error) => {
      upload.mockResolvedValueOnce({ data: null, error });
      render(<PhotoField folder="materials" slug="ct-verde" currentPath={null} label="Poză" />);

      pick();

      expect((await screen.findByRole("alert")).textContent).toBe(ADMIN_MESSAGES.forbidden);
    });

    it.each([
      ["a name already taken", STORAGE_ERRORS.nameTaken],
      ["a dropped connection", STORAGE_ERRORS.unreachable],
    ])("keeps „Încearcă din nou” for a failure that is not about access: %s", async (_case, error) => {
      upload.mockResolvedValueOnce({ data: null, error });
      render(<PhotoField folder="materials" slug="ct-verde" currentPath={null} label="Poză" />);

      pick();

      expect((await screen.findByRole("alert")).textContent).toBe(PHOTO_TEXTS.failed);
    });
  });

  // An upload that no save carried is on no row: the action only ever learns the path the form
  // loaded with and the one it posts, and „Șterge proiectul” reads the paths from the rows. So
  // the field takes such an upload out of the (public) bucket itself when it is replaced or
  // dropped, and never touches a photo a row may store.
  describe("an upload that was never saved", () => {
    /** Picks a file and returns the path the field posts once the upload is in. */
    async function pickAndWait(container: HTMLElement, name: string, previous = ""): Promise<string> {
      // Date.now() names the object: two picks in the same millisecond would share a name.
      await new Promise((resolve) => setTimeout(resolve, 5));
      pick(name);
      await waitFor(() => {
        const value = hidden(container, PHOTO_FIELDS.path).value;
        expect(value).not.toBe("");
        expect(value).not.toBe(previous);
      });
      return hidden(container, PHOTO_FIELDS.path).value;
    }

    /** Lets React finish what it has scheduled (renders, effects), so "was not removed" is not read too early. */
    const settled = () => act(async () => {});

    it("is taken out of the bucket when another photo is picked instead", async () => {
      const { container } = render(<PhotoField folder="projects" slug="p1" currentPath={null} label="Poză" />);
      const first = await pickAndWait(container, "prima.jpg");
      await settled();
      expect(remove).not.toHaveBeenCalled();

      const second = await pickAndWait(container, "a-doua.jpg", first);

      expect(second).toMatch(/^projects\/p1-\d{13}\.webp$/);
      // The replaced object, and only it: the one the field now posts stays.
      await waitFor(() => expect(remove.mock.calls).toEqual([[[first]]]));
      await settled();
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it("is taken out of the bucket on „Șterge poza”", async () => {
      const { container } = render(<PhotoField folder="projects" slug="p1" currentPath={null} label="Poză" />);
      const first = await pickAndWait(container, "prima.jpg");

      fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));

      expect(hidden(container, PHOTO_FIELDS.path).value).toBe("");
      expect(remove.mock.calls).toEqual([[[first]]]);
    });

    it("stays when the photo picked after it could not be uploaded: the field still posts it", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { container } = render(<PhotoField folder="projects" slug="p1" currentPath={null} label="Poză" />);
      const first = await pickAndWait(container, "prima.jpg");

      upload.mockResolvedValueOnce({ data: null, error: STORAGE_ERRORS.unreachable });
      pick("a-doua.jpg");
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PHOTO_TEXTS.failed));
      await settled();

      expect(hidden(container, PHOTO_FIELDS.path).value).toBe(first);
      expect(remove).not.toHaveBeenCalled();
    });

    it("never takes the stored photo out of the bucket: that is the action's to do, once the row is saved", async () => {
      const { container } = render(<PhotoField folder="materials" slug="ct-verde" currentPath={CURRENT} label="Poză" />);

      // The stored photo replaced in the field: the row still shows it on the site until the save.
      const first = await pickAndWait(container, "prima.jpg", CURRENT);
      await settled();
      expect(remove).not.toHaveBeenCalled();

      // The pick is dropped again: only the pick goes.
      fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
      expect(remove.mock.calls).toEqual([[[first]]]);
      expect(hidden(container, PHOTO_FIELDS.before).value).toBe(CURRENT);
    });

    it("leaves the stored photo alone when „Șterge poza” is pressed on it", () => {
      render(<PhotoField folder="materials" slug="ct-verde" currentPath={CURRENT} label="Poză" />);
      fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
      expect(remove).not.toHaveBeenCalled();
      expect(createClient).not.toHaveBeenCalled();
    });

    it("is left alone once the form was submitted with it: a row may store it by then, whatever the answer was", async () => {
      const { container } = render(
        <form onSubmit={(event) => event.preventDefault()}>
          <PhotoField folder="projects" slug="p1" currentPath={null} label="Poză" />
        </form>,
      );
      const first = await pickAndWait(container, "prima.jpg");

      // A save on its way, a save that failed halfway, or one whose answer was lost: the page
      // still hands the old path down, and the row may already hold the new one.
      fireEvent.submit(container.querySelector("form")!);

      const second = await pickAndWait(container, "a-doua.jpg", first);
      await settled();
      expect(remove).not.toHaveBeenCalled();

      // The pick made after the submit was never sent: it goes when it is dropped.
      fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
      expect(remove.mock.calls).toEqual([[[second]]]);
    });

    it("stays when a submit goes by before the field has drawn the pick that replaced it: that submit still posted it", async () => {
      const posted: unknown[] = [];
      let submitWithTheAnswer = false;
      const { container } = render(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            posted.push(new FormData(event.currentTarget).get(PHOTO_FIELDS.path));
          }}
        >
          <PhotoField
            folder="projects"
            slug="p1"
            currentPath={null}
            label="Poză"
            // `false` arrives with the upload's answer, before React has written the new path into
            // the hidden input. No form of the panel sends itself then (each holds its submit
            // while a photo uploads); this one does, and so reads the path of the earlier pick.
            onUploadingChange={(uploading) => {
              if (submitWithTheAnswer && !uploading) {
                document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
              }
            }}
          />
        </form>,
      );
      const first = await pickAndWait(container, "prima.jpg");

      submitWithTheAnswer = true;
      const second = await pickAndWait(container, "a-doua.jpg", first);
      await settled();

      expect(second).not.toBe(first);
      expect(posted).toEqual([first]);
      // A row may store the first pick now, although the field has moved on to the second.
      expect(remove).not.toHaveBeenCalled();
    });

    it("still counts a submit after the router hid the screen and showed it again, and removes nothing while it is hidden", async () => {
      // With cacheComponents the router does not unmount a screen that is left: it hides it in an
      // <Activity>, pick and all, and shows it again as it was.
      const kept = (mode: "visible" | "hidden") => (
        <Activity mode={mode}>
          <form onSubmit={(event) => event.preventDefault()}>
            <PhotoField folder="projects" slug="p1" currentPath={null} label="Poză" />
          </form>
        </Activity>
      );
      const { container, rerender } = render(kept("visible"));
      const first = await pickAndWait(container, "prima.jpg");

      rerender(kept("hidden"));
      await settled();
      expect(remove).not.toHaveBeenCalled();

      rerender(kept("visible"));
      expect(hidden(container, PHOTO_FIELDS.path).value).toBe(first);
      // The save made after coming back carries the pick: from here on a row may store it.
      fireEvent.submit(container.querySelector("form")!);
      const second = await pickAndWait(container, "a-doua.jpg", first);
      await settled();
      expect(remove).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));
      expect(remove.mock.calls).toEqual([[[second]]]);
    });

    it("stays in the bucket when the screen goes away with it still in the field", async () => {
      const { container, unmount } = render(<PhotoField folder="projects" slug="p1" currentPath={null} label="Poză" />);
      await pickAndWait(container, "prima.jpg");

      // Not the field's to judge: a screen the router kept can come back and be saved.
      unmount();
      await settled();

      expect(remove).not.toHaveBeenCalled();
    });

    it("says nothing when the removal fails: the object only stays where it was", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      remove.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
      const { container } = render(<PhotoField folder="projects" slug="p1" currentPath={null} label="Poză" />);
      const first = await pickAndWait(container, "prima.jpg");

      fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));

      await waitFor(() => expect(logged).toHaveBeenCalledWith(expect.stringContaining(first)));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(PHOTO_TEXTS.none)).toBeInTheDocument();

      // The same when the client cannot even be made (no env): the field stays up.
      const second = await pickAndWait(container, "a-doua.jpg");
      logged.mockClear();
      createClient.mockImplementationOnce(() => {
        throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
      });
      fireEvent.click(screen.getByRole("button", { name: PHOTO_TEXTS.remove }));

      expect(logged).toHaveBeenCalledTimes(1);
      expect(remove).not.toHaveBeenCalledWith([second]);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(PHOTO_TEXTS.none)).toBeInTheDocument();
    });
  });
});
