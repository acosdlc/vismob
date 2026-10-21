// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { failedRead } from "./fallback";

describe("failedRead", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs the reader and the cause and returns null outside production", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(failedRead("getSettings", new Error("fetch failed"))).toBeNull();
    expect(error).toHaveBeenCalledWith("getSettings: serving the seed, fetch failed");
    vi.stubEnv("VERCEL_ENV", "");
    expect(failedRead("getSettings", "no env")).toBeNull();
  });

  it("throws in production, naming the reader", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => failedRead("getCatalog", new Error("fetch failed"))).toThrow("getCatalog: fetch failed");
  });
});
