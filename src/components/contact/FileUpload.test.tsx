import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_FIELDS, FORM_MESSAGES, UPLOAD_LIMITS, type UploadUrlsResult } from "@/lib/leads/types";

const createUploadUrls = vi.fn<(count: number) => Promise<UploadUrlsResult>>();
const uploadToSignedUrl = vi.fn();
const createClient = vi.fn(() => ({ storage: { from: () => ({ uploadToSignedUrl }) } }));

vi.mock("@/actions/create-upload-urls", () => ({ createUploadUrls: (count: number) => createUploadUrls(count) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => createClient() }));
// jsdom has no canvas: compression is the identity here, a file named "broken.*" cannot be
// decoded, and one named "camera-48mp.*" comes out small, as the real resize leaves a camera's original.
const RESIZED_BYTES = 800_000;
/** How many resizes were under way at the same moment, at most. */
const resizes = { running: 0, most: 0 };
vi.mock("browser-image-compression", () => ({
  default: async (file: File) => {
    resizes.running += 1;
    resizes.most = Math.max(resizes.most, resizes.running);
    try {
      // The real resize waits for the decoder; this stands for that wait.
      await Promise.resolve();
      if (file.name.startsWith("broken.")) throw new Error("cannot decode");
      if (file.name.startsWith("camera-48mp.")) return new File([new Uint8Array(RESIZED_BYTES)], file.name, { type: "image/jpeg" });
      return file;
    } finally {
      resizes.running -= 1;
    }
  },
}));

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
  resizes.running = 0;
  resizes.most = 0;
});

describe("uploadLimitError", () => {
  it("applies the limit of 6 files with FORM_MESSAGES.uploads and leaves the size to the resized file", () => {
    expect(uploadLimitError(0, [jpeg("a.jpg")])).toBeNull();
    expect(uploadLimitError(5, [jpeg("a.jpg")])).toBeNull();
    expect(uploadLimitError(6, [jpeg("a.jpg")])).toBe(FORM_MESSAGES.uploads);
    expect(uploadLimitError(0, Array.from({ length: 7 }, (_, i) => jpeg(`${i}.jpg`)))).toBe(FORM_MESSAGES.uploads);
    // An original over 10 MB is not refused here: the limit is on the file that is uploaded.
    expect(uploadLimitError(0, [jpeg("big.jpg", UPLOAD_LIMITS.maxBytes + 1)])).toBeNull();
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

  it("refuses more than 6 photos at once without listing them or asking for URLs", () => {
    render(<FileUpload />);
    const input = screen.getByLabelText(LABEL);
    fireEvent.change(input, { target: { files: Array.from({ length: 7 }, (_, i) => jpeg(`${i}.jpg`)) } });
    expect(screen.getByText(FORM_MESSAGES.uploads)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("0.jpg")).toBeNull();
    expect(createUploadUrls).not.toHaveBeenCalled();
  });

  it("takes a camera original over 10 MB: the limit is measured on the resized file, the one that is uploaded", async () => {
    createUploadUrls.mockResolvedValue({ ok: true, uploads: [{ path: "pending/z/1.jpg", token: "t" }] });
    uploadToSignedUrl.mockResolvedValue({ data: { path: "x", fullPath: "y" }, error: null });
    const { container } = render(<FileUpload />);
    const input = screen.getByLabelText(LABEL);

    // What a phone camera writes in its 48 MP mode: 27 MB, which the resize brings under 1 MB.
    fireEvent.change(input, { target: { files: [jpeg("camera-48mp.jpg", 27 * 1024 * 1024)] } });

    await waitFor(() => expect(screen.getByText("Încărcată")).toBeInTheDocument());
    expect(screen.queryByText(FORM_MESSAGES.uploads)).toBeNull();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(createUploadUrls).toHaveBeenCalledWith(1);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    expect((uploadToSignedUrl.mock.calls[0][2] as File).size).toBe(RESIZED_BYTES);
    expect(JSON.parse(hidden(container).value)).toEqual(["pending/z/1.jpg"]);
  });

  it("refuses a photo still over 10 MB after the resize, asks for no URL for it, and uploads the rest of the selection", async () => {
    createUploadUrls.mockResolvedValue({ ok: true, uploads: [{ path: "pending/x/1.jpg", token: "t" }] });
    uploadToSignedUrl.mockResolvedValue({ data: { path: "x", fullPath: "y" }, error: null });
    const { container } = render(<FileUpload />);
    const input = screen.getByLabelText(LABEL);

    // The identity "resize" of this test leaves "big.jpg" over the limit.
    fireEvent.change(input, { target: { files: [jpeg("big.jpg", UPLOAD_LIMITS.maxBytes + 1), jpeg("ok.jpg")] } });

    await waitFor(() => expect(screen.getByText("Încărcată")).toBeInTheDocument());
    // One photo too large no longer refuses the whole selection: it alone is marked.
    expect(screen.getByText("big.jpg").closest("li")).toHaveTextContent("Eroare");
    expect(screen.getByText("ok.jpg").closest("li")).toHaveTextContent("Încărcată");
    expect(input).toHaveAccessibleDescription(FORM_MESSAGES.uploads);
    expect(createUploadUrls).toHaveBeenCalledTimes(1);
    expect(createUploadUrls).toHaveBeenCalledWith(1);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    expect((uploadToSignedUrl.mock.calls[0][2] as File).name).toBe("ok.jpg");
    expect(JSON.parse(hidden(container).value)).toEqual(["pending/x/1.jpg"]);
  });

  it("refuses a JPEG over 10 MB that the library cannot process: sent as it is, the bucket would refuse it", async () => {
    const onUploadingChange = vi.fn();
    render(<FileUpload onUploadingChange={onUploadingChange} />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("broken.jpg", UPLOAD_LIMITS.maxBytes + 1)] } });

    await waitFor(() => expect(screen.getByText("Eroare")).toBeInTheDocument());
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(FORM_MESSAGES.uploads);
    expect(createUploadUrls).not.toHaveBeenCalled();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    // The resize ran, so the form's submit was held; the refusal gives it back.
    await waitFor(() => expect(onUploadingChange.mock.calls).toEqual([[true], [false]]));
  });

  it("resizes the photos of a selection one at a time and uploads each to its own URL, in the order picked", async () => {
    // No original is refused for its size any more, and a camera's original takes hundreds of
    // megabytes while it is decoded: six decoded together could be more than a phone gives a page.
    createUploadUrls.mockResolvedValue({
      ok: true,
      uploads: [1, 2, 3].map((n) => ({ path: `pending/s/${n}.jpg`, token: `t${n}` })),
    });
    uploadToSignedUrl.mockResolvedValue({ data: { path: "x", fullPath: "y" }, error: null });
    const { container } = render(<FileUpload />);

    fireEvent.change(screen.getByLabelText(LABEL), {
      target: {
        files: [jpeg("camera-48mp.a.jpg", UPLOAD_LIMITS.maxBytes + 1), jpeg("b.jpg"), jpeg("camera-48mp.c.jpg", UPLOAD_LIMITS.maxBytes + 1)],
      },
    });

    await waitFor(() => expect(screen.getAllByText("Încărcată")).toHaveLength(3));
    expect(resizes.most).toBe(1);
    expect(createUploadUrls).toHaveBeenCalledTimes(1);
    expect(createUploadUrls).toHaveBeenCalledWith(3);
    expect(uploadToSignedUrl.mock.calls.map(([path, token, file]) => [path, token, (file as File).name])).toEqual([
      ["pending/s/1.jpg", "t1", "camera-48mp.a.jpg"],
      ["pending/s/2.jpg", "t2", "b.jpg"],
      ["pending/s/3.jpg", "t3", "camera-48mp.c.jpg"],
    ]);
    expect(JSON.parse(hidden(container).value)).toEqual(["pending/s/1.jpg", "pending/s/2.jpg", "pending/s/3.jpg"]);
  });

  it("uploads a resized photo of exactly 10 MB: only one over it is refused", async () => {
    createUploadUrls.mockResolvedValue({ ok: true, uploads: [{ path: "pending/l/1.jpg", token: "t" }] });
    uploadToSignedUrl.mockResolvedValue({ data: { path: "x", fullPath: "y" }, error: null });
    render(<FileUpload />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("limit.jpg", UPLOAD_LIMITS.maxBytes)] } });

    await waitFor(() => expect(screen.getByText("Încărcată")).toBeInTheDocument());
    expect(screen.queryByText(FORM_MESSAGES.uploads)).toBeNull();
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
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
    createUploadUrls.mockResolvedValue({ ok: false, message: FORM_MESSAGES.uploadsRateLimited });
    const { container } = render(<FileUpload />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("a.jpg"), jpeg("b.jpg")] } });

    await waitFor(() => expect(screen.getByText(FORM_MESSAGES.uploadsRateLimited)).toBeInTheDocument());
    expect(screen.getAllByText("Eroare")).toHaveLength(2);
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(FORM_MESSAGES.uploadsRateLimited);
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

    await waitFor(() => expect(screen.getByText(FORM_MESSAGES.uploadFailed)).toBeInTheDocument());
    expect(screen.getByText("Eroare")).toBeInTheDocument();
    expect(hidden(container)).toHaveValue("[]");
    errorSpy.mockRestore();
  });

  it("refuses a photo the browser cannot re-encode as JPEG and uploads the rest", async () => {
    createUploadUrls.mockResolvedValue({ ok: true, uploads: [{ path: "pending/x/1.jpg", token: "t" }] });
    uploadToSignedUrl.mockResolvedValue({ data: { path: "x", fullPath: "y" }, error: null });
    const { container } = render(<FileUpload />);
    const broken = new File([new Uint8Array(10)], "broken.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [broken, jpeg("ok.jpg")] } });

    await waitFor(() => expect(screen.getByText("Încărcată")).toBeInTheDocument());
    expect(screen.getByText("Eroare")).toBeInTheDocument();
    expect(screen.getByText(FORM_MESSAGES.uploadType)).toBeInTheDocument();
    expect(createUploadUrls).toHaveBeenCalledWith(1);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(hidden(container).value)).toEqual(["pending/x/1.jpg"]);

    // A JPEG the library cannot process is still sent as it is.
    createUploadUrls.mockResolvedValue({ ok: true, uploads: [{ path: "pending/y/1.jpg", token: "t2" }] });
    const brokenJpeg = new File([new Uint8Array(10)], "broken.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [brokenJpeg] } });
    await waitFor(() => expect(uploadToSignedUrl).toHaveBeenCalledTimes(2));
    expect(uploadToSignedUrl).toHaveBeenLastCalledWith("pending/y/1.jpg", "t2", brokenJpeg, { contentType: "image/jpeg" });
  });

  it("shows the server's field error for `uploads`", () => {
    render(<FileUpload error={FORM_MESSAGES.uploads} />);
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(FORM_MESSAGES.uploads);
  });
});

// Until „Trimite cererea” is pressed no request exists, and after any of these it can still be
// sent. So the text under the photo field names what went wrong with the photo, in its own words:
// not the count-and-size limits for a file that is not a photo, and not the request's failure texts.
describe("FileUpload: the message names the cause", () => {
  it("has the three approved photo texts, none of them a text written for the request", () => {
    expect(FORM_MESSAGES.uploadType).toBe("Nu am putut citi fișierul. Alege o poză JPG, PNG sau WebP.");
    expect(FORM_MESSAGES.uploadFailed).toBe("Nu am putut încărca poza. Încearcă din nou sau trimite cererea fără ea.");
    expect(FORM_MESSAGES.uploadsRateLimited).toBe(
      "Nu mai putem primi poze acum. Trimite cererea fără poze sau încearcă peste o oră.",
    );
  });

  it("a file that is not a photo gets the accepted formats, not the count and size limits", async () => {
    render(<FileUpload />);
    // Dropped on the field, a PDF gets past the picker's `accept`.
    const pdf = new File([new Uint8Array(77)], "broken.pdf", { type: "application/pdf" });

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [pdf] } });

    await waitFor(() => expect(screen.getByText("Eroare")).toBeInTheDocument());
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(
      "Nu am putut citi fișierul. Alege o poză JPG, PNG sau WebP.",
    );
    expect(screen.queryByText(FORM_MESSAGES.uploads)).toBeNull();
    expect(createUploadUrls).not.toHaveBeenCalled();
  });

  it("an upload that fails says the photo could not be uploaded, not that the request could not be sent", async () => {
    createUploadUrls.mockResolvedValue({ ok: true, uploads: [{ path: "pending/x/1.jpg", token: "t" }] });
    uploadToSignedUrl.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    const { container } = render(<FileUpload />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("a.jpg")] } });

    await waitFor(() => expect(screen.getByText("Eroare")).toBeInTheDocument());
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(
      "Nu am putut încărca poza. Încearcă din nou sau trimite cererea fără ea.",
    );
    expect(screen.queryByText(FORM_MESSAGES.generic)).toBeNull();
    expect(hidden(container)).toHaveValue("[]");
  });

  it("a call for the upload links that brings no answer gets the same photo text", async () => {
    createUploadUrls.mockRejectedValue(new TypeError("Failed to fetch"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<FileUpload />);

    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [jpeg("a.jpg")] } });

    await waitFor(() => expect(screen.getByText("Eroare")).toBeInTheDocument());
    expect(screen.getByLabelText(LABEL)).toHaveAccessibleDescription(
      "Nu am putut încărca poza. Încearcă din nou sau trimite cererea fără ea.",
    );
    expect(screen.queryByText(FORM_MESSAGES.generic)).toBeNull();
    errorSpy.mockRestore();
  });

  it("a file that cannot be read and a photo too large for the bucket each get their own text", async () => {
    render(<FileUpload />);
    const input = screen.getByLabelText(LABEL);

    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], "broken.png", { type: "image/png" })] } });
    await waitFor(() => expect(input).toHaveAccessibleDescription(FORM_MESSAGES.uploadType));

    fireEvent.change(input, { target: { files: [jpeg("big.jpg", UPLOAD_LIMITS.maxBytes + 1)] } });
    await waitFor(() => expect(input).toHaveAccessibleDescription(FORM_MESSAGES.uploads));
    expect(screen.getAllByText("Eroare")).toHaveLength(2);
    expect(createUploadUrls).not.toHaveBeenCalled();
  });
});
