// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));

import { signOut } from "./sign-out";

const client = { auth: { signOut: mocks.signOut } };

beforeEach(() => {
  mocks.createClient.mockReset().mockResolvedValue(client);
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signOut", () => {
  it("ends this browser's session only, then goes to the login screen", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    // Without a scope the library signs the account out on every device.
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs a sign-out Supabase refuses and still goes to the login screen", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "Auth server unreachable", status: 500 } });
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(console.warn).toHaveBeenCalledWith("signOut: Auth server unreachable");
  });

  it("logs a sign-out call that throws and still goes to the login screen", async () => {
    const failure = new TypeError("fetch failed");
    mocks.signOut.mockRejectedValue(failure);
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(console.error).toHaveBeenCalledWith("signOut", failure);
  });

  it("still goes to the login screen when the client cannot be created (no env)", async () => {
    const failure = new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    mocks.createClient.mockRejectedValue(failure);
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("signOut", failure);
  });
});
