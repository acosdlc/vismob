import type { AdminClient } from "@/lib/supabase/admin";

// A test double for the admin Supabase client: the few chains the pipeline
// uses (`from().select({ count }).eq().gt()`, `from().insert().select().single()`,
// `storage.from().list/move/createSignedUploadUrl`) with recorded calls.
// Only tests import it.

export interface FakeAdminOptions {
  leadId?: string;
  /** Count returned per table by `select(..., { count })`. */
  counts?: Partial<Record<string, number>>;
  /** Error message per table for count queries. */
  countErrors?: Partial<Record<string, string>>;
  /** Error message per table for inserts. */
  insertErrors?: Partial<Record<string, string>>;
  /** Existing storage objects: path → size in bytes. */
  objects?: Record<string, number>;
  /** Source paths whose move fails. */
  moveFails?: readonly string[];
  listError?: string;
}

export interface CountQuery {
  table: string;
  options: { count?: string; head?: boolean } | undefined;
  filters: [op: string, column: string, value: unknown][];
}

export interface FakeAdmin {
  client: AdminClient;
  inserts: { table: string; rows: Record<string, unknown>[] }[];
  countQueries: CountQuery[];
  moves: [from: string, to: string][];
  /** Live storage state (moves apply to it). */
  objects: Record<string, number>;
}

export const FAKE_LEAD_ID = "11111111-2222-4333-8444-555555555555";

export function fakeAdmin(options: FakeAdminOptions = {}): FakeAdmin {
  const objects: Record<string, number> = { ...(options.objects ?? {}) };
  const inserts: FakeAdmin["inserts"] = [];
  const countQueries: CountQuery[] = [];
  const moves: FakeAdmin["moves"] = [];
  const leadId = options.leadId ?? FAKE_LEAD_ID;

  const thenable = <T>(value: T) => ({
    then<R>(resolve: (value: T) => R, reject?: (reason: unknown) => R) {
      return Promise.resolve(value).then(resolve, reject);
    },
  });

  const from = (table: string) => ({
    select(_columns: string, selectOptions?: { count?: string; head?: boolean }) {
      const query: CountQuery = { table, options: selectOptions, filters: [] };
      countQueries.push(query);
      const message = options.countErrors?.[table];
      const result = {
        data: null,
        count: message ? null : (options.counts?.[table] ?? 0),
        error: message ? { message } : null,
      };
      const builder = {
        eq(column: string, value: unknown) {
          query.filters.push(["eq", column, value]);
          return builder;
        },
        gt(column: string, value: unknown) {
          query.filters.push(["gt", column, value]);
          return builder;
        },
        ...thenable(result),
      };
      return builder;
    },
    insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
      inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
      const message = options.insertErrors?.[table];
      const error = message ? { message } : null;
      return {
        select: () => ({
          single: async () => (error ? { data: null, error } : { data: { id: leadId }, error: null }),
        }),
        ...thenable({ data: null, error }),
      };
    },
  });

  const storage = {
    from: () => ({
      async list(folder: string, listOptions?: { search?: string }) {
        if (options.listError) return { data: null, error: { message: options.listError } };
        const prefix = `${folder}/`;
        const data = Object.entries(objects)
          .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
          .map(([path, size]) => ({ name: path.slice(prefix.length), metadata: { size } }))
          .filter((object) => !listOptions?.search || object.name.includes(listOptions.search));
        return { data, error: null };
      },
      async move(fromPath: string, toPath: string) {
        moves.push([fromPath, toPath]);
        if (options.moveFails?.includes(fromPath)) return { data: null, error: { message: "move failed" } };
        if (!(fromPath in objects)) return { data: null, error: { message: "Object not found" } };
        objects[toPath] = objects[fromPath];
        delete objects[fromPath];
        return { data: { message: "Successfully moved" }, error: null };
      },
      async createSignedUploadUrl(path: string) {
        return { data: { signedUrl: `https://storage.test/${path}`, token: `token-for-${path}`, path }, error: null };
      },
    }),
  };

  return { client: { from, storage } as unknown as AdminClient, inserts, countQueries, moves, objects };
}
