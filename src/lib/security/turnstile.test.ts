// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from "./turnstile";

vi.mock("server-only", () => ({}));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstile", () => {
  it("passes everything when the secret is unset (widget off)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetchMock = stubFetch(() => Promise.reject(new Error("must not be called")));
    expect(await verifyTurnstile(null, "203.0.113.7")).toBe(true);
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails without a token when the secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = stubFetch(() => Promise.reject(new Error("must not be called")));
    expect(await verifyTurnstile(null, "203.0.113.7")).toBe(false);
    expect(await verifyTurnstile("", "203.0.113.7")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts secret, response and remoteip and returns success", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ success: true })));
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("leaves remoteip out for an unknown ip", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ success: true })));
    expect(await verifyTurnstile("tok", "unknown")).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as URLSearchParams).has("remoteip")).toBe(false);
  });

  it("fails on success:false, a non-2xx response or a network error", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.spyOn(console, "error").mockImplementation(() => {});

    stubFetch(() => Promise.resolve(Response.json({ success: false, "error-codes": ["invalid-input-response"] })));
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(false);

    stubFetch(() => Promise.resolve(new Response("nope", { status: 500 })));
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(false);

    stubFetch(() => Promise.reject(new Error("offline")));
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(false);

    stubFetch(() => Promise.resolve(new Response("not json", { status: 200 })));
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(false);
  });
});
