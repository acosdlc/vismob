import { describe, expect, it } from "vitest";
import { loginSchema, parseLogin } from "./login-schema";
import { ADMIN_MESSAGES } from "./types";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("loginSchema", () => {
  it("trims and lowercases the email and keeps the password as typed", () => {
    expect(loginSchema.parse({ email: "  Ana@Example.COM ", password: " Secret 1 " })).toEqual({
      email: "ana@example.com",
      password: " Secret 1 ",
    });
  });
});

describe("parseLogin", () => {
  it("accepts a valid form", () => {
    expect(parseLogin(form({ email: "ana@example.com", password: "secret" }))).toEqual({
      ok: true,
      data: { email: "ana@example.com", password: "secret" },
    });
  });

  it("answers the required message for empty or missing fields", () => {
    const missing = { ok: false, fieldErrors: { email: ADMIN_MESSAGES.required, password: ADMIN_MESSAGES.required } };
    expect(parseLogin(form({ email: "", password: "" }))).toEqual(missing);
    expect(parseLogin(form({ email: "   ", password: "" }))).toEqual(missing);
    expect(parseLogin(new FormData())).toEqual(missing);
  });

  it("answers the email message for a bad address and the length message for a huge password", () => {
    expect(parseLogin(form({ email: "nu-e-email", password: "x" }))).toEqual({
      ok: false,
      fieldErrors: { email: ADMIN_MESSAGES.email },
    });
    expect(parseLogin(form({ email: "ana@example.com", password: "x".repeat(257) }))).toEqual({
      ok: false,
      fieldErrors: { password: ADMIN_MESSAGES.tooLong },
    });
  });

  it("ignores React's $ACTION entries", () => {
    const fd = form({ email: "ana@example.com", password: "secret" });
    fd.set("$ACTION_ID_1", "x");
    expect(parseLogin(fd)).toMatchObject({ ok: true });
  });
});
