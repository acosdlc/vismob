// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from "./turnstile";

vi.mock("server-only", () => ({}));

const SECRET_VALUE = "secret-value-for-tests";

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The pair as a deployment has it; an empty string is an unset variable. */
function stubKeys({ secret, siteKey }: { secret: string; siteKey: string }) {
  vi.stubEnv("TURNSTILE_SECRET_KEY", secret);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
}

const bothKeys = () => stubKeys({ secret: SECRET_VALUE, siteKey: "site-key" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstile", () => {
  it("passes everything, without a word, when neither key is set (Turnstile off)", async () => {
    stubKeys({ secret: "", siteKey: "" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = stubFetch(() => Promise.reject(new Error("must not be called")));
    expect(await verifyTurnstile(null, "203.0.113.7")).toBe(true);
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("passes and logs the missing site key when only the secret is set", async () => {
    // No site key, no widget, so no token is ever posted: failing here would refuse every visitor.
    stubKeys({ secret: SECRET_VALUE, siteKey: "" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = stubFetch(() => Promise.reject(new Error("must not be called")));

    expect(await verifyTurnstile(null, "203.0.113.7")).toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0][0]);
    expect(line).toContain("Missing environment variable NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    expect(line).not.toContain(SECRET_VALUE);
  });

  it("passes and logs the missing secret when only the site key is set", async () => {
    // The widget shows and posts a token, but nothing can check it.
    stubKeys({ secret: "", siteKey: "site-key" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = stubFetch(() => Promise.reject(new Error("must not be called")));

    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("Missing environment variable TURNSTILE_SECRET_KEY");
  });

  it("fails without a token when both keys are set", async () => {
    bothKeys();
    const fetchMock = stubFetch(() => Promise.reject(new Error("must not be called")));
    expect(await verifyTurnstile(null, "203.0.113.7")).toBe(false);
    expect(await verifyTurnstile("", "203.0.113.7")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts secret, response and remoteip and returns success", async () => {
    bothKeys();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ success: true })));
    expect(await verifyTurnstile("tok", "203.0.113.7")).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe(SECRET_VALUE);
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("203.0.113.7");
    expect(error).not.toHaveBeenCalled();
  });

  it("leaves remoteip out for an unknown ip", async () => {
    bothKeys();
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ success: true })));
    expect(await verifyTurnstile("tok", "unknown")).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as URLSearchParams).has("remoteip")).toBe(false);
  });

  it("fails on success:false, a non-2xx response or a network error", async () => {
    bothKeys();
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
