// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/configurator/catalog.seed";
import { shareUrl, siteUrl } from "./site-url";

function stubAll(values: { site?: string; production?: string; deployment?: string }) {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", values.site);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", values.production);
  vi.stubEnv("VERCEL_URL", values.deployment);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("falls back to localhost when nothing is set", () => {
    stubAll({});
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("prefers NEXT_PUBLIC_SITE_URL and strips a trailing slash", () => {
    stubAll({ site: "https://domeniu.ro/", production: "vismob.vercel.app", deployment: "vismob-abc.vercel.app" });
    expect(siteUrl()).toBe("https://domeniu.ro");
  });

  it("then the production URL, with https", () => {
    stubAll({ production: "vismob.vercel.app", deployment: "vismob-abc.vercel.app" });
    expect(siteUrl()).toBe("https://vismob.vercel.app");
  });

  it("then the deployment URL, with https", () => {
    stubAll({ deployment: "vismob-abc.vercel.app" });
    expect(siteUrl()).toBe("https://vismob-abc.vercel.app");
  });

  it("treats an empty variable as unset", () => {
    stubAll({ site: "", production: "", deployment: "vismob-abc.vercel.app" });
    expect(siteUrl()).toBe("https://vismob-abc.vercel.app");
  });

  it("reads the environment at call time", () => {
    stubAll({});
    expect(siteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://domeniu.ro");
    expect(siteUrl()).toBe("https://domeniu.ro");
  });
});

describe("shareUrl", () => {
  it("appends the configuration to /configurator", () => {
    stubAll({ site: "https://domeniu.ro" });
    expect(shareUrl(DEFAULT_CONFIG)).toBe("https://domeniu.ro/configurator?m=capitonat&s=160&f=catifea&c=ct-verde&h=120&b=lemn");
  });

  it("accepts another origin, e.g. window.location.origin in the browser", () => {
    stubAll({ site: "https://domeniu.ro" });
    expect(shareUrl({ ...DEFAULT_CONFIG, led: true }, "https://vismob-abc.vercel.app/")).toBe(
      "https://vismob-abc.vercel.app/configurator?m=capitonat&s=160&f=catifea&c=ct-verde&h=120&b=lemn&led=1",
    );
  });
});
