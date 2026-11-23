import { createHash } from "node:crypto";

// The optimistic check of the Setări form. „Salvează” writes every value the open page
// holds over the stored row, and `settings` has no version column to compare (none is
// added): a page opened earlier would put its old values back over what someone else
// saved meanwhile. So the page hands the form the fingerprint of the row it read, the
// form posts it back, and saveSettings writes only while the stored row still has that
// fingerprint. The one exception changes nothing: a post whose values the stored row
// already holds, compared by this same fingerprint (the retry of a save whose answer
// never reached the form).
//
// Server code only (node:crypto): the page and the Server Action. The name of the hidden
// input is in settings-fields.ts, where the Client Component can read it.

/**
 * The fingerprint of `settings.data`: the SHA-256, in hex, of the value written as JSON
 * with the keys of every object sorted. jsonb keeps no key order, so the object a save
 * writes and the row a later read returns differ in nothing but that order and must get
 * the same fingerprint. Pure: the same data gives the same text on every call.
 */
export function settingsFingerprint(data: unknown): string {
  // A top-level `undefined` has no JSON: it is hashed as an empty text, so the function
  // answers for anything and never returns "" (the page's value for a row it could not read).
  const json = JSON.stringify(data, withSortedKeys) ?? "";
  return createHash("sha256").update(json, "utf8").digest("hex");
}

/** The replacer of JSON.stringify: an object is written with its keys sorted, anything else as it is. */
function withSortedKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, source[key]]),
  );
}
