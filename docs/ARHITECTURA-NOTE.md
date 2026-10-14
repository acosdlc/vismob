# Note: how ARHITECTURA.md and DESIGN.md fit this repository

`docs/ARHITECTURA.md` and `docs/DESIGN.md` were written before this repository existed. Where they differ from the starter recipe (`docs/stack.md`), the decisions below win.

| Topic | The docs say | This repository does |
|---|---|---|
| Package manager | pnpm (`pnpm dev`, `pnpm test`…) | **npm**: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` |
| Folders | `app/`, `components/`, `lib/`, `actions/`, `emails/` at the root | everything under **`src/`**: `src/app/`, `src/components/`, `src/lib/`, `src/actions/`, `src/emails/`. The `@/*` alias points to `src/*`. `supabase/`, `scripts/`, `docs/` and `tests/e2e/` stay at the root. Unit tests sit next to the code as `*.test.ts(x)` under `src/` (Vitest only looks there). |
| Supabase clients | `lib/supabase/server.ts` uses the secret key | `src/lib/supabase/server.ts` is the cookie-based client with the publishable key (row level security applies). The secret-key client gets its own `server-only` module when phase 3 needs it. `src/proxy.ts` refreshes the session only on `/admin` and `/auth`. |
| Databases | prod (Pro) + staging (Free) | **one** Supabase project in Frankfurt (`eu-central-1`) for Production, Preview and Development, pinned in `.claude/project.json`. Previews write to the live database, so schema changes are additive and go through the `db-change` skill. In Preview, `NOTIFY_EMAIL` points to the developer, so test requests never reach the workshop. |
| Local development | `supabase start` with Docker, `NOTIFY_DRY_RUN=1` | there is no local machine: work happens in Claude Code cloud sessions, and a change is seen on its pull request's Vercel preview. `NOTIFY_DRY_RUN` stays as a switch for tests. |
| Migrations | `supabase migration new` + `supabase db push` | one SQL file per change in `supabase/migrations/`, applied through the `db-change` skill. |
| UI components | own components, no UI library | shadcn/ui (Base UI) is part of the starter, but DESIGN.md wins: use a shadcn primitive only where it matches a DESIGN.md component exactly, restyled to its tokens. Do not add components DESIGN.md does not describe. |
| Notifications | Resend email + Twilio SMS | **email only, through Resend.** No Twilio, no SMS. The client's email is **required** in all three forms (contact, configurator, samples) because every confirmation goes by email. ARHITECTURA.md and DESIGN.md have already been edited to match. |
| Next.js | 16.x | `create-next-app` installed Next.js 16.4 with `cacheComponents` on. Read `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`). |

## Not set up yet

- **shadcn/ui** is not initialised: the cloud environment blocks `ui.shadcn.com`. Add that host to the environment's allowed domains, then run `npx shadcn@latest init --defaults --base base --no-monorepo --yes`.
- **Playwright** and `@axe-core/playwright` come in phase 1, together with the first real pages.
