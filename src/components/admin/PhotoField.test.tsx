import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { ADMIN_MESSAGES } from "@/lib/admin/types";

const upload = vi.fn();
const createClient = vi.fn(() => ({ storage: { from: () => ({ upload }) } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => createClient() }));
// jsdom has no canvas: compression is the identity here, and a file named "broken.*" cannot be decoded.
vi.mock("browser-image-compression", () => ({
  default: async (file: File) => {
    if (file.name.startsWith("broken.")) throw new Error("cannot decode");
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

    pick("huge.jpg", 11 * 1024 * 1024);
    expect(screen.getByRole("alert")).toHaveTextContent(PHOTO_TEXTS.failed);
    // Only the first pick reached the bucket: the others stopped before the upload.
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("renders a server-side error under the field", () => {
    render(<PhotoField folder="materials" slug="x" currentPath={null} label="Poză" error="Poza nu e validă." />);
    expect(screen.getByLabelText("Poză")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Poza nu e validă.")).toBeInTheDocument();
  });
});
