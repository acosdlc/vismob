// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SSR client is replaced by one whose getClaims() answers what the test sets and,
// when asked, writes a refreshed cookie through the `setAll` the proxy passed in.
const mocks = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  refreshedCookie: null as { name: string; value: string } | null,
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    url: string,
    key: string,
    options: {
      cookies: {
        setAll: (
          cookies: { name: string; value: string; options: Record<string, unknown> }[],
          headers: Record<string, string>,
        ) => void;
      };
    },
  ) => {
    mocks.createServerClient(url, key);
    return {
      auth: {
        getClaims: async () => {
          if (mocks.refreshedCookie) {
            options.cookies.setAll([{ ...mocks.refreshedCookie, options: { path: "/", httpOnly: true } }], {});
          }
          return mocks.claims
            ? { data: { claims: mocks.claims }, error: null }
            : { data: null, error: { message: "Auth session missing!" } };
        },
      },
    };
  },
}));

import { isGuardedPath, proxy } from "./proxy";

const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const ADMIN = { sub: "u1", email: "ana@example.com", app_metadata: { role: "admin" } };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.claims = null;
  mocks.refreshedCookie = null;
  mocks.createServerClient.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isGuardedPath", () => {
  it("guards /admin and everything under it except the login screen", () => {
    expect(isGuardedPath("/admin")).toBe(true);
    expect(isGuardedPath("/admin/")).toBe(true);
    expect(isGuardedPath("/admin/cereri")).toBe(true);
    expect(isGuardedPath("/admin/cereri/abc")).toBe(true);
    expect(isGuardedPath("/admin/login")).toBe(false);
    expect(isGuardedPath("/admin/login/")).toBe(false);
    expect(isGuardedPath("/administrare")).toBe(false);
    expect(isGuardedPath("/auth/callback")).toBe(false);
  });
});

describe("proxy", () => {
  it("sends an anonymous visitor of /admin to /admin/login and keeps the refreshed cookies", async () => {
    mocks.refreshedCookie = { name: "sb-test-auth-token", value: "rotated" };
    const response = await proxy(request("/admin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/login");
    const cookie = response.cookies.get("sb-test-auth-token");
    expect(cookie?.value).toBe("rotated");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("redirects the nested admin screens too", async () => {
    const response = await proxy(request("/admin/cereri?status=nou"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("lets an anonymous visitor reach /admin/login", async () => {
    const response = await proxy(request("/admin/login"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a signed-in user through, with the refreshed cookies on the response", async () => {
    mocks.claims = ADMIN;
    mocks.refreshedCookie = { name: "sb-test-auth-token", value: "rotated" };
    const response = await proxy(request("/admin/cereri"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("rotated");
  });

  it("lets a signed-in user without the role through: the layout guard explains the missing role", async () => {
    mocks.claims = { sub: "u2", app_metadata: {} };
    const response = await proxy(request("/admin"));
    expect(response.status).toBe(200);
  });

  it("treats missing Supabase variables as anonymous instead of failing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const guarded = await proxy(request("/admin"));
    expect(guarded.status).toBe(307);
    expect(guarded.headers.get("location")).toBe("http://localhost:3000/admin/login");

    const login = await proxy(request("/admin/login"));
    expect(login.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
