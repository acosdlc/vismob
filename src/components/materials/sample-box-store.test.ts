import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleBoxStore, readStoredIds, useSampleBox } from "./sample-box-store";
import { SAMPLE_BOX_STORAGE_KEY } from "./types";

const VALID = ["ct-verde", "ct-mustar", "bc-alb", "bc-nisip", "sf-gri", "pe-coniac", "lm-nuc"];
const stored = () => JSON.parse(window.localStorage.getItem(SAMPLE_BOX_STORAGE_KEY) ?? "null");

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("readStoredIds", () => {
  it("keeps only known ids, in order, without duplicates and at most the limit", () => {
    expect(readStoredIds(JSON.stringify({ ids: ["bc-alb", "nope", "ct-verde", "bc-alb", 7] }), 5, VALID)).toEqual([
      "bc-alb",
      "ct-verde",
    ]);
    expect(readStoredIds(JSON.stringify({ ids: VALID }), 5, VALID)).toEqual(VALID.slice(0, 5));
  });

  it("treats anything odd as an empty box", () => {
    expect(readStoredIds(null, 5, VALID)).toEqual([]);
    expect(readStoredIds("not json", 5, VALID)).toEqual([]);
    expect(readStoredIds(JSON.stringify(["ct-verde"]), 5, VALID)).toEqual([]);
    expect(readStoredIds(JSON.stringify({ ids: "ct-verde" }), 5, VALID)).toEqual([]);
  });
});

describe("useSampleBox", () => {
  it("starts empty and un-hydrated, then reads the stored box after mount", () => {
    window.localStorage.setItem(SAMPLE_BOX_STORAGE_KEY, JSON.stringify({ ids: ["bc-nisip", "ct-verde"] }));
    const { result } = renderHook(() => useSampleBox(5, VALID));
    // After mount the store has subscribed and hydrated.
    expect(result.current.hydrated).toBe(true);
    expect(result.current.ids).toEqual(["bc-nisip", "ct-verde"]);
    expect(result.current.limit).toBe(5);
    expect(result.current.isFull).toBe(false);
    expect(result.current.has("ct-verde")).toBe(true);
    expect(result.current.has("lm-nuc")).toBe(false);
  });

  it("gives the server an empty box", () => {
    const store = createSampleBoxStore(5, VALID);
    expect(store.getServerSnapshot()).toEqual({ ids: [], hydrated: false });
    expect(store.getSnapshot()).toEqual({ ids: [], hydrated: false });
  });

  it("drops invalid and extra ids on read and writes the clean box back on the next change", () => {
    window.localStorage.setItem(
      SAMPLE_BOX_STORAGE_KEY,
      JSON.stringify({ ids: ["nope", "ct-verde", "ct-mustar", "bc-alb", "bc-nisip", "sf-gri", "pe-coniac"] }),
    );
    const { result } = renderHook(() => useSampleBox(5, VALID));
    expect(result.current.ids).toEqual(["ct-verde", "ct-mustar", "bc-alb", "bc-nisip", "sf-gri"]);
    expect(result.current.isFull).toBe(true);

    act(() => result.current.remove("bc-alb"));
    expect(stored()).toEqual({ ids: ["ct-verde", "ct-mustar", "bc-nisip", "sf-gri"] });
  });

  it("adds up to the limit, refuses the sixth and a duplicate, and round-trips through storage", () => {
    const { result } = renderHook(() => useSampleBox(5, VALID));
    const added: boolean[] = [];
    act(() => {
      for (const id of VALID.slice(0, 5)) added.push(result.current.add(id));
    });
    expect(added).toEqual([true, true, true, true, true]);
    expect(result.current.ids).toEqual(VALID.slice(0, 5));
    expect(result.current.isFull).toBe(true);

    let sixth: boolean | undefined;
    act(() => {
      sixth = result.current.add("pe-coniac");
    });
    expect(sixth).toBe(false);
    expect(result.current.ids).toHaveLength(5);

    act(() => result.current.remove("ct-verde"));
    let duplicate: boolean | undefined;
    act(() => {
      duplicate = result.current.add("ct-mustar");
    });
    expect(duplicate).toBe(false);
    expect(result.current.ids).toEqual(["ct-mustar", "bc-alb", "bc-nisip", "sf-gri"]);
    expect(stored()).toEqual({ ids: ["ct-mustar", "bc-alb", "bc-nisip", "sf-gri"] });

    // A fresh mount reads what the previous one wrote.
    const again = renderHook(() => useSampleBox(5, VALID));
    expect(again.result.current.ids).toEqual(["ct-mustar", "bc-alb", "bc-nisip", "sf-gri"]);
  });

  it("refuses an id that is not in the catalogue", () => {
    const { result } = renderHook(() => useSampleBox(5, VALID));
    let ok: boolean | undefined;
    act(() => {
      ok = result.current.add("nope");
    });
    expect(ok).toBe(false);
    expect(result.current.ids).toEqual([]);
  });

  it("clears the box and the stored copy", () => {
    window.localStorage.setItem(SAMPLE_BOX_STORAGE_KEY, JSON.stringify({ ids: ["bc-nisip", "ct-verde"] }));
    const { result } = renderHook(() => useSampleBox(5, VALID));
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
    expect(result.current.isFull).toBe(false);
    expect(stored()).toEqual({ ids: [] });
  });

  it("keeps working when storage throws (private mode, quota)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(() => useSampleBox(5, VALID));
    expect(result.current.hydrated).toBe(true);
    expect(result.current.ids).toEqual([]);

    let ok: boolean | undefined;
    act(() => {
      ok = result.current.add("ct-verde");
    });
    expect(ok).toBe(true);
    expect(result.current.ids).toEqual(["ct-verde"]);
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
  });

  it("works with no storage at all", () => {
    const store = createSampleBoxStore(2, VALID, () => null);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.add("ct-verde")).toBe(true);
    expect(store.add("bc-alb")).toBe(true);
    expect(store.add("sf-gri")).toBe(false);
    expect(store.getSnapshot()).toEqual({ ids: ["ct-verde", "bc-alb"], hydrated: true });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
