import { describe, expect, it } from "vitest";
import { adminFromSession, ANONYMOUS, sessionFromClaims } from "./session";

const claims = (extra: Record<string, unknown>) =>
  ({ iss: "supabase", aud: "authenticated", exp: 1, iat: 0, role: "authenticated", ...extra }) as never;

describe("sessionFromClaims", () => {
  it("is anonymous without claims or without a subject", () => {
    expect(sessionFromClaims(null)).toBe(ANONYMOUS);
    expect(sessionFromClaims(undefined)).toBe(ANONYMOUS);
    expect(sessionFromClaims(claims({ sub: "" }))).toBe(ANONYMOUS);
    expect(sessionFromClaims(claims({ app_metadata: { role: "admin" } }))).toBe(ANONYMOUS);
  });

  it("reads the admin role only from app_metadata, never from user_metadata or the Postgres role", () => {
    expect(sessionFromClaims(claims({ sub: "u1", email: "a@b.ro", app_metadata: { role: "admin" } }))).toEqual({
      kind: "signed-in",
      userId: "u1",
      email: "a@b.ro",
      admin: true,
    });
    expect(sessionFromClaims(claims({ sub: "u1", user_metadata: { role: "admin" } }))).toMatchObject({ admin: false });
    expect(sessionFromClaims(claims({ sub: "u1", role: "admin" }))).toMatchObject({ admin: false });
    expect(sessionFromClaims(claims({ sub: "u1", app_metadata: { role: "Admin" } }))).toMatchObject({ admin: false });
    expect(sessionFromClaims(claims({ sub: "u1", app_metadata: { role: ["admin"] } }))).toMatchObject({ admin: false });
  });

  it("keeps the email only when it is a non-empty string", () => {
    expect(sessionFromClaims(claims({ sub: "u1", email: "" }))).toMatchObject({ email: null });
    expect(sessionFromClaims(claims({ sub: "u1" }))).toMatchObject({ email: null });
  });
});

describe("adminFromSession", () => {
  it("is null for anonymous and for signed-in users without the role", () => {
    expect(adminFromSession(ANONYMOUS)).toBeNull();
    expect(adminFromSession({ kind: "signed-in", userId: "u1", email: null, admin: false })).toBeNull();
    expect(adminFromSession({ kind: "signed-in", userId: "u1", email: "a@b.ro", admin: true })).toEqual({
      userId: "u1",
      email: "a@b.ro",
    });
  });
});
