// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaUrl } from "./media";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mediaUrl", () => {
  it("builds the public URL of an object in the media bucket, encoding each segment", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(mediaUrl("lucrari/foto-01.jpg")).toBe(
      "https://example.supabase.co/storage/v1/object/public/media/lucrari/foto-01.jpg",
    );
    expect(mediaUrl("mostre/catifea/verde sticlă.jpg")).toBe(
      "https://example.supabase.co/storage/v1/object/public/media/mostre/catifea/verde%20sticl%C4%83.jpg",
    );
  });

  it("ignores a trailing slash on the project URL and stray slashes in the path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co/");
    expect(mediaUrl("/lucrari//foto-01.jpg")).toBe(
      "https://example.supabase.co/storage/v1/object/public/media/lucrari/foto-01.jpg",
    );
  });

  it("returns undefined for null, undefined or an empty path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(mediaUrl(null)).toBeUndefined();
    expect(mediaUrl(undefined)).toBeUndefined();
    expect(mediaUrl("")).toBeUndefined();
    expect(mediaUrl("/")).toBeUndefined();
  });

  it("returns undefined instead of throwing when the env is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(mediaUrl("lucrari/foto-01.jpg")).toBeUndefined();
  });
});
