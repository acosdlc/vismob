# VisMob

The website of a workshop that makes beds to order. It presents the workshop and its finished work, and it has a bed configurator with a drawing to scale, a material sample library (samples sent home on request) and request forms. It is not an online shop: every request reaches the workshop by email. The interface is in Romanian.

**Stack:** Next.js (App Router, TypeScript) · Tailwind CSS · Supabase · Resend · Vercel · Vitest, with npm.

## Documents

- [`docs/DESIGN.md`](docs/DESIGN.md): design, pages and the configurator
- [`docs/ARHITECTURA.md`](docs/ARHITECTURA.md): architecture and the plan in phases
- [`docs/ARHITECTURA-NOTE.md`](docs/ARHITECTURA-NOTE.md): how those documents map onto this repository
- [`docs/LISTA-ATELIER.md`](docs/LISTA-ATELIER.md): what the workshop has to provide
- [`docs/stack.md`](docs/stack.md): the standard stack and its rules

## How changes ship

Work happens in Claude Code cloud sessions. Each change goes on a branch and gets a pull request, and Vercel builds a preview for it. Merging into `main` deploys to production.

Before a pull request: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
