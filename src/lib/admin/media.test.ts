import { describe, expect, it, vi } from "vitest";
import { isMediaPath, mediaObjectPath, mediaSlug, PHOTO_FIELDS, photoChange, removeMediaObject } from "./media";

describe("mediaSlug and mediaObjectPath", () => {
  it("turns a name into a safe object name and keeps the folder, the stamp and the extension", () => {
    expect(mediaSlug("Verde sticlă")).toBe("verde-sticla");
    expect(mediaSlug("  Țesătură / Ștofă  ")).toBe("tesatura-stofa");
    expect(mediaSlug("***")).toBe("foto");
    expect(mediaSlug("a".repeat(80))).toHaveLength(60);
    expect(mediaObjectPath("materials", "ct-verde", 1792569508760)).toBe("materials/ct-verde-1792569508760.webp");
    expect(mediaObjectPath("bases", "Lemn", 1792569508760.9)).toBe("bases/lemn-1792569508760.webp");
  });
});

describe("isMediaPath", () => {
  it("accepts only the paths PhotoField produces", () => {
    expect(isMediaPath("materials/ct-verde-1792569508760.webp")).toBe(true);
    expect(isMediaPath("bases/lemn-1792569508760.webp", "bases")).toBe(true);
    expect(isMediaPath("bases/lemn-1792569508760.webp", "materials")).toBe(false);
    expect(isMediaPath("materials/../x-1792569508760.webp")).toBe(false);
    expect(isMediaPath("projects/a-1792569508760.webp")).toBe(false);
    expect(isMediaPath("materials/a-1792569508760.jpg")).toBe(false);
    expect(isMediaPath("materials/a-12.webp")).toBe(false);
    expect(isMediaPath("materials/-a-1792569508760.webp")).toBe(false);
    expect(isMediaPath(null)).toBe(false);
    expect(isMediaPath(42)).toBe(false);
  });
});

describe("photoChange", () => {
  const form = (path?: string, before?: string) => {
    const fd = new FormData();
    if (path !== undefined) fd.set(PHOTO_FIELDS.path, path);
    if (before !== undefined) fd.set(PHOTO_FIELDS.before, before);
    return fd;
  };

  it("keeps an unchanged photo, removes a replaced or cleared one, and refuses foreign paths", () => {
    const a = "materials/a-1792569508760.webp";
    const b = "materials/b-1792569508761.webp";
    expect(photoChange(form(a, a), "materials")).toEqual({ ok: true, path: a, remove: null });
    expect(photoChange(form(b, a), "materials")).toEqual({ ok: true, path: b, remove: a });
    expect(photoChange(form("", a), "materials")).toEqual({ ok: true, path: null, remove: a });
    expect(photoChange(form(a, ""), "materials")).toEqual({ ok: true, path: a, remove: null });
    expect(photoChange(form(), "materials")).toEqual({ ok: true, path: null, remove: null });
    expect(photoChange(form("bases/x-1792569508760.webp", ""), "materials")).toEqual({ ok: false });
    expect(photoChange(form(a, "../etc/passwd"), "materials")).toEqual({ ok: false });
  });
});

describe("removeMediaObject", () => {
  it("removes from the media bucket, and only logs a failure", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const storage = { from: vi.fn(() => ({ remove })) };
    await removeMediaObject(storage, "materials/a-1792569508760.webp");
    expect(storage.from).toHaveBeenCalledWith("media");
    expect(remove).toHaveBeenCalledWith(["materials/a-1792569508760.webp"]);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    remove.mockResolvedValueOnce({ error: { message: "nope" } });
    await expect(removeMediaObject(storage, "materials/a-1792569508760.webp")).resolves.toBeUndefined();
    remove.mockRejectedValueOnce(new Error("down"));
    await expect(removeMediaObject(storage, "materials/a-1792569508760.webp")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();

    await removeMediaObject(storage, null);
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
