// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authorizeCron } from "./auth";

const SECRET = "a-random-cron-secret-of-32-bytes";

function get(authorization?: string): Request {
  return new Request("https://www.vismob.dev/api/cron/retention", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authorizeCron", () => {
  it("fails closed with 503 and a log when CRON_SECRET is not set", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(authorizeCron(get(`Bearer ${SECRET}`))).toEqual({ ok: false, status: 503 });
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("answers 401 without the header", () => {
    expect(authorizeCron(get())).toEqual({ ok: false, status: 401 });
    expect(errors).not.toHaveBeenCalled();
  });

  it("answers 401 unless the header is exactly `Bearer <secret>`", () => {
    for (const wrong of [
      "",
      "Bearer",
      "Bearer ",
      "Bearer x",
      `Bearer ${SECRET.slice(0, -1)}`,
      `Bearer ${SECRET}x`,
      `bearer ${SECRET}`,
      `Bearer  ${SECRET}`,
      SECRET,
      `Basic ${SECRET}`,
    ]) {
      expect(authorizeCron(get(wrong)), JSON.stringify(wrong)).toEqual({ ok: false, status: 401 });
    }
  });

  it("accepts the exact bearer token", () => {
    expect(authorizeCron(get(`Bearer ${SECRET}`))).toEqual({ ok: true });
    expect(errors).not.toHaveBeenCalled();
  });
});
