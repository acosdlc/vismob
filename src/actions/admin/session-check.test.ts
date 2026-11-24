// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The proxy lets a POST to /admin through (src/proxy.ts): a Server Action call has to
// reach the action so that it, not a redirect, answers a lost session. Nothing but the
// action's own first lines stops an anonymous call, then. This test reads every action
// in this folder and fails when one does not begin with the session check, so a new
// action cannot be added without it. Every export of a "use server" module is an
// action, whatever its form, and only one form is read here (`export async function
// name(` at the start of a line, the body opening where the signature ends): an export
// written any other way fails the test too, in any module at any depth of the folder.

const DIR = join(process.cwd(), "src/actions/admin");

/** The two actions that open and close the session, by module: they cannot ask for one. */
const SESSION_ACTIONS = new Map([
  ["sign-in.ts", "signIn"],
  ["sign-out.ts", "signOut"],
]);

const FIRST = "const admin = await getAdminSession();";
const SECOND = 'if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };';

/** The one form an action is exported in, from the start of its line. */
const ACTION = /^export async function (\w+)\(/;
/** Types are gone before the module runs, so they are not actions. */
const TYPE_EXPORT = /^export (?:type|interface)\s/;

/** The first two statements of each exported action of a module, as written. */
function openings(source: string): { name: string; lines: string[] }[] {
  const lines = source.split("\n");
  const found: { name: string; lines: string[] }[] = [];
  lines.forEach((line, start) => {
    const match = ACTION.exec(line);
    if (!match) return;
    // The signature may wrap: the body opens on the first line that ends with "{".
    let open = start;
    while (open < lines.length && !lines[open].trimEnd().endsWith("{")) open += 1;
    // That line must be this function's own: the export line, or the ")" line that
    // closes its indented parameters. Otherwise the body began earlier (on the
    // signature's line, say) and what follows the brace found is some later block or
    // function, whose first lines must not pass for this one's: nothing is read.
    const wrapped = lines.slice(start + 1, open + 1);
    const own = wrapped.every((text, i) => (i < wrapped.length - 1 ? /^\s+\S/.test(text) : text.startsWith(")")));
    const body = lines
      .slice(open + 1)
      .map((text) => text.trim())
      .filter((text) => text !== "" && !text.startsWith("//"));
    found.push({ name: match[1], lines: own ? body.slice(0, 2) : [] });
  });
  return found;
}

/** Every source module under the folder, tests aside: subfolders, .tsx and plain JavaScript too. */
const modules = readdirSync(DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
  .sort();

describe("the admin actions", () => {
  it("finds the actions it is meant to read", () => {
    expect(modules.length).toBeGreaterThanOrEqual(16);
    expect(modules).toEqual(expect.arrayContaining([...SESSION_ACTIONS.keys()]));
  });

  it.each(modules)("%s exports only actions that open with the session check, signIn and signOut aside", (file) => {
    const source = readFileSync(join(DIR, file), "utf8");
    expect(source.startsWith('"use server";')).toBe(true);
    // A const, an export list, a default or a re-export is an action all the same, and
    // one that `openings` does not see: only type exports may stand beside the actions.
    for (const line of source.split("\n")) {
      if (/^\s*export\b/.test(line) && !TYPE_EXPORT.test(line)) expect(line, file).toMatch(ACTION);
    }
    const exported = openings(source);
    expect(exported.length).toBeGreaterThan(0);
    for (const action of exported) {
      // Only the session's own action is let off, not whatever else its module exports.
      if (SESSION_ACTIONS.get(file) === action.name) continue;
      expect(action.lines, `${file}: ${action.name}`).toEqual([FIRST, SECOND]);
    }
  });
});
