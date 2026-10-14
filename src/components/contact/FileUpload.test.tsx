import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_FIELDS, FORM_MESSAGES, UPLOAD_LIMITS, type UploadUrlsResult } from "@/lib/leads/types";

const createUploadUrls = vi.fn<(count: number) => Promise<UploadUrlsResult>>();
const uploadToSignedUrl = vi.fn();
const createClient = vi.fn(() => ({ storage: { from: () => ({ uploadToSignedUrl }) } }));

vi.mock("@/actions/create-upload-urls", () => ({ createUploadUrls: (count: number) => createUploadUrls(count) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => createClient() }));
// jsdom has no canvas: compression is the identity here.
vi.mock("browser-image-compression", () => ({ default: async (file: File) => file }));

import { FileUpload, uploadLimitError } from "./FileUpload";

const LABEL = "Poze cu camera sau cu un pat care îți place (opțional)";

function jpeg(name: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

function hidden(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`input[name="${FORM_FIELDS.uploads}"]`)!;
}

beforeEach(() => {
  createUploadUrls.mockReset();
  uploadToSignedUrl.mockReset();
  createClient.mockClear();
});

describe("uploadLimitError", () => {
  it("applies the 6 files × 10 MB limits with FORM_MESSAGES.uploads", () => {
    expect(uploadLimitError(0, [jpeg("a.jpg")])).toBeNull();
    expect(uploadLimitError(5, [jpeg("a.jpg")])).toBeNull();
    expect(uploadLimitError(6, [jpeg("a.jpg")])).toBe(FORM_MESSAGES.uploads);
    expect(uploadLimitError(0, Array.from({ length: 7 }, (_, i) => jpeg(`${i}.jpg`)))).toBe(FORM_MESSAGES.uploads);
    expect(uploadLimitError(0, [jpeg("big.jpg", UPLOAD_LIMITS.maxBytes + 1)])).toBe(FORM_MESSAGES.uploads);
  });
});

describe("FileUpload", () => {
  it("is a labelled, multiple file input with the accepted image types and no name", () => {
    const { container } = render(<FileUpload />);
    const input = screen.getByLabelText(LABEL);
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", UPLOAD_LIMITS.accept);
    expect(input).toHaveAttribute("multiple");
    expect(input).not.toHaveAttribute("name");
    expect(hidden(container)).toHaveValue("[]");
  });

  it("refuses a selection over the limits without asking for URLs", () => {
    render(<FileUpload />);
    const input = screen.getByLabelText(LABEL);
    fireEvent.change(input, { target: { files: [jpeg("big.jpg", UPLOAD_LIMITS.maxBytes + 1)] } });
    expect(screen.getByText(FORM_MESSAGES.uploads)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(createUploadUrls).not.toHaveBeenCalled();
  });

  it("uploads to the signed URL, lists the file, writes its path and can remove it", async () => {
    createUploadUrls.mockResolvedValue({
      ok: true,
      uploads: [{ path: "pending/11111111-1111-1111-1111-111111111111/1.jpg", token: "t1" }],
    });
    uploadToSignedUrl.mockResolvedValue({ data: { path: "x", fullPath: "y" }, error: null });
    const onUploadingChange = vi.fn();
    const { container } = render(<FileUpload onUploadingChange={onUploadingChange} />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("camera.jpg")] } });

    expect(screen.getByText("camera.jpg")).toBeInTheDocument();
    expect(onUploadingChange).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.getByText("Încărcată")).toBeInTheDocument());
    expect(createUploadUrls).toHaveBeenCalledWith(1);
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      "pending/11111111-1111-1111-1111-111111111111/1.jpg",
      "t1",
      expect.any(File),
      { contentType: "image/jpeg" },
    );
    expect(JSON.parse(hidden(container).value)).toEqual(["pending/11111111-1111-1111-1111-111111111111/1.jpg"]);
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);

    const remove = screen.getByRole("button", { name: "Scoate camera.jpg" });
    expect(remove.className).toContain("size-11");
    fireEvent.click(remove);
    expect(screen.queryByText("camera.jpg")).toBeNull();
    expect(hidden(container)).toHaveValue("[]");
  });

  it("fails gracefully with the action's message when no URL can be issued", async () => {
    createUploadUrls.mockResolvedValue({ ok: false, message: FORM_MESSAGES.generic });
    const { container } = render(<FileUpload />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("a.jpg"), jpeg("b.jpg")] } });

    await waitFor(() => expect(screen.getByText(FORM_MESSAGES.generic)).toBeInTheDocument());
    expect(screen.getAllByText("Eroare")).toHaveLength(2);
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(FORM_MESSAGES.generic);
    expect(hidden(container)).toHaveValue("[]");
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it("fails gracefully when the browser client cannot be created (no NEXT_PUBLIC_SUPABASE_URL)", async () => {
    createUploadUrls.mockResolvedValue({ ok: true, uploads: [{ path: "pending/x/1.jpg", token: "t" }] });
    createClient.mockImplementationOnce(() => {
      throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<FileUpload />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("a.jpg")] } });

    await waitFor(() => expect(screen.getByText(FORM_MESSAGES.generic)).toBeInTheDocument());
    expect(screen.getByText("Eroare")).toBeInTheDocument();
    expect(hidden(container)).toHaveValue("[]");
    errorSpy.mockRestore();
  });

  it("shows the server's field error for `uploads`", () => {
    render(<FileUpload error={FORM_MESSAGES.uploads} />);
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(FORM_MESSAGES.uploads);
  });
});
