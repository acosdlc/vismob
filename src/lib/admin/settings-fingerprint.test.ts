// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";
import { settingsFingerprint } from "./settings-fingerprint";

/** The same object as jsonb gives it back: the keys by length, then by bytes, whatever order they were written in. */
function asStored(data: object): unknown {
  const entries = Object.entries(data).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1));
  return JSON.parse(JSON.stringify(Object.fromEntries(entries)));
}

describe("settingsFingerprint", () => {
  it("gives the same data in a different key order the same fingerprint", () => {
    const reversed = Object.fromEntries(Object.entries(SEED_SETTINGS).reverse());
    expect(Object.keys(reversed)).not.toEqual(Object.keys(SEED_SETTINGS));
    expect(reversed).toEqual(SEED_SETTINGS);
    expect(settingsFingerprint(reversed)).toBe(settingsFingerprint(SEED_SETTINGS));

    // What the action writes and what the next read of the row returns are the same row.
    const stored = asStored(SEED_SETTINGS);
    expect(Object.keys(stored as object)).not.toEqual(Object.keys(SEED_SETTINGS));
    expect(settingsFingerprint(stored)).toBe(settingsFingerprint(SEED_SETTINGS));
  });

  it("ignores the key order of nested objects too, and keeps the order of a list", () => {
    expect(settingsFingerprint({ a: { x: 1, y: [1, { p: true, q: null }] }, b: "" })).toBe(
      settingsFingerprint({ b: "", a: { y: [1, { q: null, p: true }], x: 1 } }),
    );
    expect(settingsFingerprint({ list: [1, 2] })).not.toBe(settingsFingerprint({ list: [2, 1] }));
  });

  it("changes with any one value, and with a key added or removed", () => {
    const seed = settingsFingerprint(SEED_SETTINGS);
    const others = new Set<string>([seed]);
    for (const [key, value] of Object.entries(SEED_SETTINGS)) {
      const changed = typeof value === "boolean" ? !value : `${value} `;
      others.add(settingsFingerprint({ ...SEED_SETTINGS, [key]: changed }));
    }
    // Every single change gave a fingerprint of its own.
    expect(others.size).toBe(Object.keys(SEED_SETTINGS).length + 1);

    const withoutCity = Object.fromEntries(Object.entries(SEED_SETTINGS).filter(([key]) => key !== "city"));
    expect(settingsFingerprint(withoutCity)).not.toBe(seed);
    expect(settingsFingerprint({ ...SEED_SETTINGS, sample_limit: 5 })).not.toBe(seed);
  });

  it("tells a value from the text that spells it, and one key from another", () => {
    expect(settingsFingerprint({ show_prices: true })).not.toBe(settingsFingerprint({ show_prices: "true" }));
    expect(settingsFingerprint({ a: "" })).not.toBe(settingsFingerprint({ a: null }));
    expect(settingsFingerprint({ a: "1", b: "" })).not.toBe(settingsFingerprint({ a: "", b: "1" }));
    expect(settingsFingerprint({ a: 'x","b":"y' })).not.toBe(settingsFingerprint({ a: "x", b: "y" }));
  });

  it("is a short text of hex digits, the same on every call, for anything a row can hold", () => {
    for (const data of [SEED_SETTINGS, {}, [], null, "", 0, false, undefined]) {
      const fingerprint = settingsFingerprint(data);
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(settingsFingerprint(data)).toBe(fingerprint);
    }
    // Never the empty text: the page passes "" when it could not read the row, and no row may answer to that.
    expect(settingsFingerprint(undefined)).not.toBe("");
    expect(settingsFingerprint({})).not.toBe(settingsFingerprint(null));
  });
});
