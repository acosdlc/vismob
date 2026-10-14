# Standard stack

This is the recipe every project created from the starter follows. Change this file in the starter to change what future projects get.

| Layer | Choice |
|---|---|
| Framework | Next.js, latest stable, App Router, TypeScript strict |
| Styling | Tailwind CSS + shadcn/ui on Base UI primitives |
| Database, auth, storage | Supabase (one project per repository) |
| Hosting | Vercel (one project per repository, deploys from GitHub) |
| Email | Resend |
| Forms and validation | React Hook Form + Zod |
| Tests | Vitest + Testing Library |
| Package manager | npm |

## Rules that come with it

- Next.js changes between versions. Before writing framework code, read the matching guide in `node_modules/next/dist/docs/` (see `AGENTS.md`). Do not write Next.js from memory.
- Server Components by default; `"use client"` only where a component needs it.
- Every form and every server action validates its input with Zod.
- Every table in an exposed schema has row level security enabled and explicit policies. No table is left open.
- Mobile first. Check layouts at 375px wide.
- Code must lint, type-check, test and build with no environment variables set. Read them at request time, not at module load, and fail with a clear message when one is missing.

## Environment variables

The Vercel Supabase integration puts these on the Vercel project by itself. Nobody copies them by hand.

| Name | Where it is used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server; safe to expose, row level security applies |
| `SUPABASE_SECRET_KEY` | server only; bypasses row level security; never give it a `NEXT_PUBLIC_` prefix |

Supabase is retiring the old `anon` and `service_role` keys. Use the publishable and secret keys above and do not introduce the old names.

Any other secret (for example `RESEND_API_KEY`) is added by the user on the Vercel project's Environment Variables page. Give them the name and the link; never ask for the value in chat. `create_project_env` is for values that are not secret. List every variable the code reads in `.env.example`, names only.

## Scaffold

Run once, by the `setup-project` skill. `create-next-app` refuses a folder that already has a `README.md` or `CLAUDE.md`, so scaffold into a temporary folder and copy the result in. The paths are fixed, so the lines can be run one at a time.

```bash
rm -rf /tmp/project-scaffold /tmp/project-scaffold.gitignore
npx create-next-app@latest /tmp/project-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --skip-install --yes
rm -rf /tmp/project-scaffold/.git /tmp/project-scaffold/.claude /tmp/project-scaffold/CLAUDE.md
mv /tmp/project-scaffold/.gitignore /tmp/project-scaffold.gitignore
cp -a /tmp/project-scaffold/. .
cat /tmp/project-scaffold.gitignore >> .gitignore
npm install
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers resend
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
npx shadcn@latest init --defaults --base base --no-monorepo --yes
```

- If a flag is rejected, run the command with `--help` and use the current equivalent; do not drop the option silently.
- `shadcn` downloads from `ui.shadcn.com`. If that host cannot be reached, the cloud environment does not allow it: skip the last command, finish the rest, and tell the user (and the setup pull request) that shadcn/ui is not initialised yet and that `ui.shadcn.com` has to be added to the cloud environment's allowed domains. Item 3 below picks it up on the next run.
- The same goes for `npm run build` failing to download fonts from `fonts.gstatic.com`: name the host for the user; do not rewrite the app to avoid it.

### After the commands

Each item is checked on its own, so an interrupted setup can be finished. Do whatever is missing:

1. `AGENTS.md` comes from `create-next-app`; keep it as generated.
2. Every package named in the two `npm install` lines above is in `package.json`, and `node_modules` exists. If not, run those lines again.
3. `components.json` exists (shadcn/ui is initialised). If not, run the `shadcn` line again.
4. `.gitignore` has both the starter's lines (`.env*`, `!.env.example`) and Next's (`.next/`, `node_modules`). If Next's are missing, add them.
5. `package.json` has the project slug as its `name` (the scaffold leaves "project-scaffold"), and the scripts `"test": "vitest run"` and `"typecheck": "tsc --noEmit"`.
6. `vitest.config.ts` exists, uses the `jsdom` environment and the `@/*` alias, and limits tests to the app: `test.include` is `['src/**/*.{test,spec}.{ts,tsx}']`. Without that, Vitest picks up the guard's own test under `.claude/` and fails on it.
7. The ESLint config ignores `.claude/**`.
8. Supabase clients (only when the project has a database): `src/lib/supabase/client.ts` (browser), `src/lib/supabase/server.ts` (server) and the session-refresh proxy file. Take the current code from the Supabase docs (connector tool `search_docs`, "Next.js server-side auth") and the Next.js docs in `node_modules`.
9. The generated home page is replaced by a minimal page that states the project name, with one passing test for it.

Nothing in `.claude/` is changed to make a check pass.

## Layout

```
src/app/                  routes, layouts, server actions
src/components/           shared components (shadcn/ui lives in src/components/ui)
src/lib/                  helpers; src/lib/supabase/ for the clients and generated types
supabase/migrations/      one SQL file per schema change (see the db-change skill)
docs/                     this file and any project notes
```
