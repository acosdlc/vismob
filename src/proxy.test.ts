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

const request = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost:3000${path}`, init);
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

  it("redirects an anonymous HEAD like the GET it stands for", async () => {
    const response = await proxy(request("/admin/cereri", { method: "HEAD" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("lets an anonymous POST (a Server Action call) through instead of redirecting it", async () => {
    mocks.refreshedCookie = { name: "sb-test-auth-token", value: "rotated" };
    const response = await proxy(
      request("/admin/setari", { method: "POST", headers: { "next-action": "a".repeat(42) } }),
    );

    // Not answered here: the request goes on to the route (NextResponse.next()), where
    // the action refuses it with its own message and the form keeps what was typed.
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    // The rotated cookie goes on with the request, for the action to read. The response
    // carries none: the next two tests say why.
    expect(response.headers.get("x-middleware-request-cookie")).toBe("sb-test-auth-token=rotated");
    expect(response.cookies.get("sb-test-auth-token")).toBeUndefined();
  });

  it("writes no cookie on a Server Action call whose session was just refused", async () => {
    // Supabase Auth refused the session (it was ended, or its renewal was refused): the
    // SSR client empties the cookie through setAll and the visitor is anonymous.
    mocks.refreshedCookie = { name: "sb-test-auth-token", value: "" };
    const response = await proxy(
      request("/admin/setari", {
        method: "POST",
        headers: { "next-action": "a".repeat(42), cookie: "sb-test-auth-token=stale" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    // Next counts a cookie set here as set by the action: its answer would also carry a
    // fresh render of the page, the (panel) layout's guard would redirect that render to
    // /admin/login, and the form would be gone with what was typed.
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-middleware-set-cookie")).toBeNull();
    // The action still reads the emptied cookie and answers ADMIN_MESSAGES.forbidden.
    expect(response.headers.get("x-middleware-request-cookie")).toBe("sb-test-auth-token=");
  });

  it("writes none either when the renewed session has lost the admin role", async () => {
    mocks.claims = { sub: "u2", app_metadata: {} };
    mocks.refreshedCookie = { name: "sb-test-auth-token", value: "renewed" };
    const response = await proxy(
      request("/admin/preturi", {
        method: "POST",
        headers: { "next-action": "a".repeat(42), cookie: "sb-test-auth-token=old" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-middleware-set-cookie")).toBeNull();
    expect(response.headers.get("x-middleware-request-cookie")).toBe("sb-test-auth-token=renewed");
  });

  it("keeps the renewed cookie on an admin's Server Action call", async () => {
    // The ordinary renewal during a save: the browser must get the new session, and the
    // page that Next renders into the answer passes the guard.
    mocks.claims = ADMIN;
    mocks.refreshedCookie = { name: "sb-test-auth-token", value: "rotated" };
    const response = await proxy(
      request("/admin/setari", { method: "POST", headers: { "next-action": "a".repeat(42) } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    const cookie = response.cookies.get("sb-test-auth-token");
    expect(cookie?.value).toBe("rotated");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("goes by the method, not by the action header: a form posted without JavaScript passes too", async () => {
    const response = await proxy(request("/admin/cereri/abc", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
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
    mocks.refreshedCookie = { name: "sb-test-auth-token", value: "renewed" };
    const response = await proxy(request("/admin"));
    expect(response.status).toBe(200);
    // A navigation writes the cookie a Server Action call left out.
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("renewed");
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
