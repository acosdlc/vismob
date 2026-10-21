// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("allows the site, disallows /admin and /api, and names the sitemap at the site's origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.vismob.dev/");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
      sitemap: "https://www.vismob.dev/sitemap.xml",
    });
  });

  it("points the sitemap at localhost in a build with no variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});
