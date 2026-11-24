// @vitest-environment node
import { unstable_rethrow } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Next's connection() and cookies() and the SSR client are replaced, so the test decides
// when "a real request is there" and sees what createClient() has done by then.
const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  cookies: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { createClient } from "./server";

interface CookieAdapter {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void;
}

const SESSION_COOKIE = { name: "sb-test-auth-token", value: "session" };
const CLIENT = { marker: "client" };

/** Lets the pending microtasks and one timer turn run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * What Next gives a prerender pass in place of the request: a promise it leaves pending
 * and rejects, with an error of its own, when the pass ends.
 */
function heldByNext() {
  const ended = Object.assign(
    new Error("During prerendering, `connection()` rejects when the prerender is complete."),
    { digest: "HANGING_PROMISE_REJECTION" },
  );
  let endPass: () => void = () => undefined;
  const promise = new Promise<void>((_, reject) => {
    endPass = () => reject(ended);
  });
  return { promise, endPass, ended };
}

/** What createClient() has called so far, in order. */
let calls: string[];
let store: { getAll: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  calls = [];
  store = { getAll: vi.fn(() => [SESSION_COOKIE]), set: vi.fn() };
  mocks.connection.mockReset().mockImplementation(async () => {
    calls.push("connection");
  });
  mocks.cookies.mockReset().mockImplementation(async () => {
    calls.push("cookies");
    return store;
  });
  mocks.createServerClient.mockReset().mockImplementation(() => {
    calls.push("createServerClient");
    return CLIENT;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createClient (the signed-in user's cookie client)", () => {
  // With Partial Prefetching (next.config.ts) Next prerenders every panel screen again at
  // request time: for a link's prefetch, and once beside every navigation and page load.
  // cookies() resolves in such a pass, so the client used to be built and used there: its
  // clock read was reported as an error, and every read, cut when the pass ended, was
  // logged by the screens as a failed read.
  it("reads no cookie and builds no client while there is no real request", async () => {
    const pass = heldByNext();
    mocks.connection.mockImplementation(() => {
      calls.push("connection");
      return pass.promise;
    });

    const outcome = createClient().then(
      () => "a client",
      (err: unknown) => err,
    );
    await settle();
    expect(calls).toEqual(["connection"]);

    // Next ends the pass. Its own rejection reaches the caller as it is: every caller's
    // unstable_rethrow() recognises it and hands it back, so nothing is logged.
    pass.endPass();
    expect(await outcome).toBe(pass.ended);
    expect(() => unstable_rethrow(pass.ended)).toThrow(pass.ended);
    expect(calls).toEqual(["connection"]);
  });

  it("waits for the request, then reads its cookies and builds the client from them", async () => {
    await expect(createClient()).resolves.toBe(CLIENT);

    expect(calls).toEqual(["connection", "cookies", "createServerClient"]);
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });

  it("gives the client the request's cookies, and writes its cookies where the request allows", async () => {
    await createClient();
    const adapter = (mocks.createServerClient.mock.calls[0][2] as { cookies: CookieAdapter }).cookies;

    expect(adapter.getAll()).toEqual([SESSION_COOKIE]);

    adapter.setAll([{ name: "sb-test-auth-token", value: "renewed", options: { path: "/" } }]);
    expect(store.set).toHaveBeenCalledWith("sb-test-auth-token", "renewed", { path: "/" });

    // A Server Component cannot set cookies: Next throws, and the proxy renews the session instead.
    store.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });
    expect(() => adapter.setAll([{ name: "sb-test-auth-token", value: "again", options: {} }])).not.toThrow();
  });
});
