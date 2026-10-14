// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, ipHash } from "./ip";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": " 2001:db8::1 " }))).toBe("2001:db8::1");
  });

  it("is unknown without the header", () => {
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});

describe("ipHash", () => {
  it("is a stable sha256 hex of ip + salt", () => {
    vi.stubEnv("IP_HASH_SALT", "salt-a");
    const first = ipHash("203.0.113.7");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash("203.0.113.7")).toBe(first);
    expect(ipHash("203.0.113.8")).not.toBe(first);
  });

  it("changes with the salt and fails without one", () => {
    vi.stubEnv("IP_HASH_SALT", "salt-a");
    const a = ipHash("203.0.113.7");
    vi.stubEnv("IP_HASH_SALT", "salt-b");
    expect(ipHash("203.0.113.7")).not.toBe(a);
    vi.stubEnv("IP_HASH_SALT", "");
    expect(() => ipHash("203.0.113.7")).toThrow(/IP_HASH_SALT/);
  });
});
