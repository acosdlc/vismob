// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_MESSAGES } from "@/lib/admin/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));

import { signIn } from "./sign-in";

const client = {
  auth: { signInWithPassword: mocks.signInWithPassword, getClaims: mocks.getClaims, signOut: mocks.signOut },
};

const claims = (extra: Record<string, unknown>) => ({
  data: { claims: { sub: "u1", email: "ana@example.com", ...extra } },
  error: null,
});

function form(entries: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) fd.set(key, value);
  return fd;
}

const VALID = { email: " Ana@Example.com ", password: "secret" };
const IDLE = { status: "idle" } as const;

beforeEach(() => {
  mocks.createClient.mockReset().mockResolvedValue(client);
  mocks.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.getClaims.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.revalidatePath.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signIn", () => {
  it("answers field errors for an invalid form without touching Supabase", async () => {
    const state = await signIn(IDLE, form({ email: "", password: "secret" }));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { email: ADMIN_MESSAGES.required },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the credentials message when Supabase rejects the password, never its own text", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    });
    const state = await signIn(IDLE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.credentials });
    // The email reaches Supabase trimmed and lowercased.
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "secret" });
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs a user without the admin role out again and says so", async () => {
    mocks.getClaims.mockResolvedValue(claims({ app_metadata: {} }));
    const state = await signIn(IDLE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notAdmin });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the claims cannot be verified, without signing out", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: { message: "JWKS fetch failed", name: "AuthError" } });
    const state = await signIn(IDLE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects an admin to /admin after refreshing the layout", async () => {
    mocks.getClaims.mockResolvedValue(claims({ app_metadata: { role: "admin" } }));
    await expect(signIn(IDLE, form(VALID))).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await signIn(IDLE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the auth call itself throws", async () => {
    mocks.signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));
    const state = await signIn(IDLE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
  });
});
