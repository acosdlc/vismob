// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The proxy lets a POST to /admin through (src/proxy.ts): a Server Action call has to
// reach the action so that it, not a redirect, answers a lost session. Nothing but the
// action's own first lines stops an anonymous call, then. This test reads every action
// in this folder and fails when one does not begin with the session check, so a new
// action cannot be added without it.

const DIR = join(process.cwd(), "src/actions/admin");

/** The two actions that open and close the session: they cannot ask for one. */
const SESSION_ACTIONS = new Set(["sign-in.ts", "sign-out.ts"]);

const FIRST = "const admin = await getAdminSession();";
const SECOND = 'if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };';

/** The first two statements of each exported function of a module, as written. */
function openings(source: string): { name: string; lines: string[] }[] {
  const lines = source.split("\n");
  const found: { name: string; lines: string[] }[] = [];
  lines.forEach((line, start) => {
    const match = /^export (?:async )?function (\w+)/.exec(line);
    if (!match) return;
    // The signature may wrap: the body opens on the first line that ends with "{".
    let open = start;
    while (open < lines.length && !lines[open].trimEnd().endsWith("{")) open += 1;
    const body = lines
      .slice(open + 1)
      .map((text) => text.trim())
      .filter((text) => text !== "" && !text.startsWith("//"));
    found.push({ name: match[1], lines: body.slice(0, 2) });
  });
  return found;
}

const modules = readdirSync(DIR).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

describe("the admin actions", () => {
  it("finds the actions it is meant to read", () => {
    expect(modules.length).toBeGreaterThanOrEqual(16);
    expect(modules).toEqual(expect.arrayContaining([...SESSION_ACTIONS]));
  });

  it.each(modules.filter((file) => !SESSION_ACTIONS.has(file)))("%s checks the admin session before anything else", (file) => {
    const source = readFileSync(join(DIR, file), "utf8");
    expect(source.startsWith('"use server";')).toBe(true);
    const exported = openings(source);
    expect(exported.length).toBeGreaterThan(0);
    for (const action of exported) {
      expect(action.lines, `${file}: ${action.name}`).toEqual([FIRST, SECOND]);
    }
  });
});
