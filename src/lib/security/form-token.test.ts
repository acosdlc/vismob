// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_TOKEN_MAX_AGE_MS, mintFormToken, verifyFormToken } from "./form-token";

vi.mock("server-only", () => ({}));

const NOW = 1_760_000_000_000;

beforeEach(() => {
  vi.stubEnv("FORM_HMAC_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("form token", () => {
  it("round-trips and reports the age in whole seconds", () => {
    const token = mintFormToken(NOW);
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(verifyFormToken(token, NOW + 4_500)).toEqual({ ok: true, ageSeconds: 4 });
    expect(verifyFormToken(token, NOW)).toEqual({ ok: true, ageSeconds: 0 });
  });

  it("rejects a tampered timestamp or signature", () => {
    const token = mintFormToken(NOW);
    const [ms, signature] = token.split(".");
    expect(verifyFormToken(`${Number(ms) - 10_000}.${signature}`, NOW)).toEqual({ ok: false });
    const flipped = (signature[0] === "0" ? "1" : "0") + signature.slice(1);
    expect(verifyFormToken(`${ms}.${flipped}`, NOW)).toEqual({ ok: false });
  });

  it("rejects a token signed with another secret", () => {
    const token = mintFormToken(NOW);
    vi.stubEnv("FORM_HMAC_SECRET", "other-secret");
    expect(verifyFormToken(token, NOW + 5_000)).toEqual({ ok: false });
  });

  it("rejects malformed input", () => {
    expect(verifyFormToken(null, NOW)).toEqual({ ok: false });
    expect(verifyFormToken("", NOW)).toEqual({ ok: false });
    expect(verifyFormToken("abc", NOW)).toEqual({ ok: false });
    expect(verifyFormToken(`${NOW}.short`, NOW)).toEqual({ ok: false });
    expect(verifyFormToken(`${NOW}.${"g".repeat(64)}`, NOW)).toEqual({ ok: false });
  });

  it("rejects a token older than 24 hours", () => {
    const token = mintFormToken(NOW);
    expect(verifyFormToken(token, NOW + FORM_TOKEN_MAX_AGE_MS).ok).toBe(true);
    expect(verifyFormToken(token, NOW + FORM_TOKEN_MAX_AGE_MS + 1)).toEqual({ ok: false });
  });

  it("cannot mint without the secret", () => {
    vi.stubEnv("FORM_HMAC_SECRET", "");
    expect(() => mintFormToken(NOW)).toThrow(/FORM_HMAC_SECRET/);
  });
});
