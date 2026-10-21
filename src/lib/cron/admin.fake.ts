import type { AdminClient } from "@/lib/supabase/admin";

// A test double for the admin Supabase client as the cron jobs use it: every
// query builder chain is recorded (table, operation, payload, filters in order)
// and answered by the test's `respond` function; the storage side holds a map of
// object paths to their `created_at`, lists it like Supabase does (folders as
// entries with `id: null`) and removes from it. Only tests import it.

export interface FakeQuery {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  /** select: the columns string; insert/update: the payload. */
  payload: unknown;
  options: Record<string, unknown> | undefined;
  /** Chained calls in order, e.g. `["eq", "ok", false]`, `["order", "at", { ascending: true }]`, `["limit", 50]`. */
  filters: [method: string, ...args: unknown[]][];
  single: boolean;
}

export interface FakeResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

export type Responder = (query: FakeQuery) => FakeResult | undefined;

export interface FakeCronAdminOptions {
  /** Answers each query once it is awaited; `undefined` means "no rows, no error". */
  respond?: Responder;
  /** Storage objects in the bucket: path → `created_at` (ISO). */
  objects?: Record<string, string>;
  listError?: string;
  removeError?: string;
}

export interface FakeListCall {
  prefix: string;
  options: { limit?: number; offset?: number; sortBy?: unknown; search?: string } | undefined;
}

export interface FakeCronAdmin {
  client: AdminClient;
  queries: FakeQuery[];
  lists: FakeListCall[];
  /** Each `remove()` call's paths. */
  removed: string[][];
  /** Live storage state (removes apply to it). */
  objects: Record<string, string>;
}

const CHAIN_METHODS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "or", "order", "limit"] as const;

export function fakeCronAdmin(options: FakeCronAdminOptions = {}): FakeCronAdmin {
  const objects: Record<string, string> = { ...(options.objects ?? {}) };
  const queries: FakeQuery[] = [];
  const lists: FakeListCall[] = [];
  const removed: string[][] = [];

  const builder = (query: FakeQuery) => {
    const run = async (): Promise<Required<FakeResult>> => {
      const answer = options.respond?.(query) ?? {};
      const emptyData = query.op === "select" && !query.single ? [] : null;
      return { data: answer.data ?? emptyData, error: answer.error ?? null, count: answer.count ?? null };
    };
    const chain: Record<string, unknown> = {
      then<R>(resolve: (value: Required<FakeResult>) => R, reject?: (reason: unknown) => R) {
        return run().then(resolve, reject);
      },
      maybeSingle() {
        query.single = true;
        return run();
      },
    };
    for (const method of CHAIN_METHODS) {
      chain[method] = (...args: unknown[]) => {
        query.filters.push([method, ...args]);
        return chain;
      };
    }
    return chain;
  };

  const start = (table: string, op: FakeQuery["op"], payload: unknown, queryOptions?: Record<string, unknown>) => {
    const query: FakeQuery = { table, op, payload, options: queryOptions, filters: [], single: false };
    queries.push(query);
    return builder(query);
  };

  const from = (table: string) => ({
    select: (columns = "*", selectOptions?: Record<string, unknown>) => start(table, "select", columns, selectOptions),
    insert: (rows: unknown, insertOptions?: Record<string, unknown>) => start(table, "insert", rows, insertOptions),
    update: (values: unknown, updateOptions?: Record<string, unknown>) => start(table, "update", values, updateOptions),
    delete: (deleteOptions?: Record<string, unknown>) => start(table, "delete", undefined, deleteOptions),
  });

  const entry = (name: string, createdAt: string | null) => ({
    name,
    id: createdAt === null ? null : `id-${name}`,
    created_at: createdAt,
    updated_at: createdAt,
    last_accessed_at: createdAt,
    metadata: createdAt === null ? null : { size: 1 },
  });

  const storage = {
    from: () => ({
      async list(prefix = "", listOptions?: FakeListCall["options"]) {
        lists.push({ prefix, options: listOptions });
        if (options.listError) return { data: null, error: { message: options.listError } };
        const base = prefix ? `${prefix.replace(/\/+$/, "")}/` : "";
        const files: ReturnType<typeof entry>[] = [];
        const folders = new Set<string>();
        for (const [path, createdAt] of Object.entries(objects)) {
          if (!path.startsWith(base)) continue;
          const rest = path.slice(base.length);
          const slash = rest.indexOf("/");
          if (slash === -1) files.push(entry(rest, createdAt));
          else folders.add(rest.slice(0, slash));
        }
        const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
        const all = [...[...folders].sort().map((name) => entry(name, null)), ...files.sort(byName)];
        const offset = listOptions?.offset ?? 0;
        const limit = listOptions?.limit ?? 100;
        return { data: all.slice(offset, offset + limit), error: null };
      },
      async remove(paths: string[]) {
        removed.push([...paths]);
        if (options.removeError) return { data: null, error: { message: options.removeError } };
        const data = paths.filter((path) => path in objects).map((path) => entry(path, objects[path]));
        for (const path of paths) delete objects[path];
        return { data, error: null };
      },
    }),
  };

  return { client: { from, storage } as unknown as AdminClient, queries, lists, removed, objects };
}

/** The first filter of `query` with this method, e.g. `filterOf(q, "lt")` → `["lt", "created_at", "…"]`. */
export function filterOf(query: FakeQuery, method: string): unknown[] | undefined {
  return query.filters.find(([name]) => name === method);
}

/** True when the query chained `method` with exactly these arguments. */
export function hasFilter(query: FakeQuery, method: string, ...args: unknown[]): boolean {
  return query.filters.some(
    ([name, ...given]) => name === method && JSON.stringify(given) === JSON.stringify(args),
  );
}
