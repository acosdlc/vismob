// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_TOKEN_RENEW_MS } from "@/lib/leads/types";
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

  it("still accepts, with an hour to spare, a token as old as the one the forms replace", () => {
    // ContactForm and QuoteForm ask for a new token once theirs is FORM_TOKEN_RENEW_MS old. That
    // age has to stay well under the limit above: a form that replaced its token only after the
    // limit would post, until then, a token that is refused on every try.
    expect(FORM_TOKEN_MAX_AGE_MS - FORM_TOKEN_RENEW_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    const token = mintFormToken(NOW);
    expect(verifyFormToken(token, NOW + FORM_TOKEN_RENEW_MS)).toEqual({ ok: true, ageSeconds: FORM_TOKEN_RENEW_MS / 1000 });
  });

  it("cannot mint or verify without the secret", () => {
    vi.stubEnv("FORM_HMAC_SECRET", "");
    expect(() => mintFormToken(NOW)).toThrow(/FORM_HMAC_SECRET/);
    expect(() => verifyFormToken("", NOW)).toThrow(/FORM_HMAC_SECRET/);
  });
});
