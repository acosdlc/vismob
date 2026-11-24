// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formValues } from "./form-values";

describe("formValues", () => {
  it("turns CR LF and a lone CR into LF", () => {
    const fd = new FormData();
    fd.set("crlf", "Luni–Vineri 9–18\r\nSâmbătă 10–14\r\n\r\nDuminică închis");
    fd.set("cr", "unu\rdoi\r\rtrei");
    fd.set("mixed", "unu\r\ndoi\rtrei\npatru");
    expect(formValues(fd)).toEqual({
      crlf: "Luni–Vineri 9–18\nSâmbătă 10–14\n\nDuminică închis",
      cr: "unu\ndoi\n\ntrei",
      mixed: "unu\ndoi\ntrei\npatru",
    });
  });

  it("reads a text from a posted multipart body with the length the field counted", async () => {
    // A textarea counts a line break once (its value holds LF, and `maxLength` is checked
    // against that), but the body a browser builds from the form carries it as CR LF.
    const typed = "Luni–Vineri 9–18\nSâmbătă 10–14";
    const fd = new FormData();
    fd.set("hours", typed);
    const posted = await new Response(fd).formData();
    // The premise: what a Server Action receives is one character longer per line break.
    expect(posted.get("hours")).toBe("Luni–Vineri 9–18\r\nSâmbătă 10–14");
    expect(formValues(posted)).toEqual({ hours: typed });
  });

  it("changes no other character: LF, spaces, tabs and the rest stay as posted", () => {
    const text = "  „Ș ț”\t100% 😀 \\r\\n\n\n ultimul rând  ";
    const fd = new FormData();
    fd.set("text", text);
    expect(formValues(fd)).toEqual({ text });
  });

  it("keeps the first value per name and skips files and React's own entries", () => {
    const fd = new FormData();
    fd.append("name", "Ana");
    fd.append("name", "Dup");
    fd.append("$ACTION_ID_abc", "x");
    fd.append("file", new Blob(["x"]), "x.txt");
    expect(formValues(fd)).toEqual({ name: "Ana" });
  });
});
