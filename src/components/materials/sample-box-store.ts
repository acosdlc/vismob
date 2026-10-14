"use client";

import { useState, useSyncExternalStore } from "react";
import { SAMPLE_BOX_STORAGE_KEY, type SampleBoxApi } from "./types";

// The sample box's state (DESIGN §4.3): the chosen Color.ids, kept in
// localStorage under `mostre:v1` as `{ "ids": string[] }`. The page is static,
// so the server and the first client render show an empty box; the stored ids
// are read in the store's `subscribe`, which React runs after mount, and the
// box re-renders with them. Every storage access sits in try/catch (private
// mode, quota, blocked storage): without storage the box still works for the
// visit. The box starts empty; nothing is preselected.

export interface SampleBoxSnapshot {
  ids: string[];
  hydrated: boolean;
}

export interface SampleBoxStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SampleBoxSnapshot;
  getServerSnapshot(): SampleBoxSnapshot;
  has(id: string): boolean;
  add(id: string): boolean;
  remove(id: string): void;
  clear(): void;
}

/** The empty box, shared by the server render and the un-hydrated client render. */
const EMPTY: SampleBoxSnapshot = { ids: [], hydrated: false };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored ids that are still in the catalogue, in stored order, at most `limit`; [] on anything odd. */
export function readStoredIds(raw: string | null, limit: number, validIds: readonly string[]): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { ids?: unknown }).ids)) return [];
  const known = new Set(validIds);
  const ids: string[] = [];
  for (const id of (parsed as { ids: unknown[] }).ids) {
    if (typeof id === "string" && known.has(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export function createSampleBoxStore(
  limit: number,
  validIds: readonly string[],
  getStorage: () => StorageLike | null = storage,
): SampleBoxStore {
  let snapshot: SampleBoxSnapshot = EMPTY;
  const listeners = new Set<() => void>();
  const known = new Set(validIds);

  function hydrate() {
    if (snapshot.hydrated) return;
    let raw: string | null = null;
    try {
      raw = getStorage()?.getItem(SAMPLE_BOX_STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    snapshot = { ids: readStoredIds(raw, limit, validIds), hydrated: true };
  }

  function set(ids: string[]) {
    snapshot = { ids, hydrated: true };
    try {
      getStorage()?.setItem(SAMPLE_BOX_STORAGE_KEY, JSON.stringify({ ids }));
    } catch {
      // Storage full or blocked: the box still works for this visit.
    }
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      // React subscribes after mount: the first safe moment to touch localStorage.
      if (!snapshot.hydrated) {
        hydrate();
        listener();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY,
    has: (id) => snapshot.ids.includes(id),
    add(id) {
      hydrate();
      if (!known.has(id) || snapshot.ids.includes(id) || snapshot.ids.length >= limit) return false;
      set([...snapshot.ids, id]);
      return true;
    },
    remove(id) {
      hydrate();
      if (!snapshot.ids.includes(id)) return;
      set(snapshot.ids.filter((other) => other !== id));
    },
    clear() {
      hydrate();
      set([]);
    },
  };
}

/**
 * The box as the page components use it (SampleBoxApi in types.ts). `limit` and
 * `validIds` come from the server's settings and catalogue and do not change
 * during a visit; the store is created once per mount.
 */
export function useSampleBox(limit: number, validIds: readonly string[]): SampleBoxApi {
  const [store] = useState(() => createSampleBoxStore(limit, validIds));
  const { ids, hydrated } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  return {
    ids,
    limit,
    isFull: ids.length >= limit,
    hydrated,
    has: store.has,
    add: store.add,
    remove: store.remove,
    clear: store.clear,
  };
}
