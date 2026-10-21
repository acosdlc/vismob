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
| Notifications | Resend email + Twilio SMS | **email only, through Resend.** No Twilio, no SMS. The client's email is **required** in both forms (contact, configurator) because every confirmation goes by email. ARHITECTURA.md and DESIGN.md have already been edited to match. |
| Admin | `/admin` in v2, after launch; v1 edits content in Supabase Studio behind Database Webhooks | **`/admin` is built before launch** (PLAN PR-7…PR-9): email and password login, the admin role in `app_metadata`, every save expires its cache tag itself, and the real content is entered through it (PR-11). No Database Webhooks are created. This supersedes the v1/v2 split in ARHITECTURA §0, §1, §3, §4, §6.5, §13 and §14. |
| Drawing PNG | `renderToStaticMarkup(<BedDrawing mode="export">)` + `fontFiles` | a pure serialiser `sheetSvg()` in `src/lib/configurator/sheet.ts` writes the sheet (scene + SVG `<text>` dimensions in DM Mono); `src/lib/notify/drawing-png.ts` renders it with `@resvg/resvg-js` from the font embedded as base64 (`src/lib/notify/dm-mono.ts`), written once per process to `os.tmpdir()` and loaded through `fontFiles` (the Node binding of resvg-js 2.6 has no `fontBuffers`), so no `react-dom/server` and no font file to ship with the function. |
| Crons | three jobs, `fontFiles`, staging | `GET /api/cron/[job]` with `Authorization: Bearer CRON_SECRET` (Vercel adds the header itself), schedules in `vercel.json`, Node runtime, `maxDuration` 60 s. |
| Next.js | 16.x | `create-next-app` installed Next.js 16.4 with `cacheComponents` on. Read `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`). |

## Not set up yet

- **shadcn/ui** is not initialised: the cloud environment blocks `ui.shadcn.com`. Add that host to the environment's allowed domains, then run `npx shadcn@latest init --defaults --base base --no-monorepo --yes`.
