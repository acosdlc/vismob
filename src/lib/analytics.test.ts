// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
import { EVENTS, trackEvent } from "./analytics";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const tracked = vi.mocked(track);

beforeEach(() => {
  tracked.mockReset();
});

describe("trackEvent", () => {
  it("names exactly the six events of ARHITECTURA §10", () => {
    expect(EVENTS).toEqual(["config_start", "config_step", "quote_submit", "contact_submit", "whatsapp_click", "phone_click"]);
  });

  it("calls track with the name and the properties", () => {
    trackEvent("config_step", { step: "model" });
    trackEvent("config_start");
    expect(tracked).toHaveBeenNthCalledWith(1, "config_step", { step: "model" });
    expect(tracked).toHaveBeenNthCalledWith(2, "config_start", undefined);
  });

  it("swallows a throwing track", () => {
    tracked.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => trackEvent("phone_click", { place: "header" })).not.toThrow();
    expect(tracked).toHaveBeenCalledTimes(1);
  });
});
