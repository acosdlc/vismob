# Build plan

How VisMob gets built after setup (phase 0, pull request #1). It replaces the phase list in `docs/ARHITECTURA.md` §13 with pull-request-sized steps; the rest of that document and `docs/DESIGN.md` stay the specification. Where this file settles something the other documents leave open, this file wins.

## Principles

1. **A page ships only whole.** A route either does not exist yet (404) or matches `docs/DESIGN.md` §4 in every section, including a form whose Server Action is live. No disabled submit buttons, no fake confirmations.
2. **Placeholders are data, never copy.** Every `[...]` on screen comes from typed seeds (`settings.seed.ts`, `catalog.seed.ts`, `projects.seed.ts`, `reviews.seed.ts`) holding the exact DESIGN §8 bracket strings. Components contain only DESIGN's own text. Nothing is invented: no reviews, no prices, no cities. A line whose value is empty (Google rating, price, WhatsApp number, Instagram) hides itself.
3. **Every PR builds with zero environment variables** in the cloud session: env is read at request time; data readers fall back to the seeds when `NEXT_PUBLIC_SUPABASE_URL` is absent and throw when `VERCEL_ENV === 'production'`; a missing Turnstile key means "widget off", a missing Resend key means "log only".
4. **Logic in `src/lib`, pure and tested; components only render.** The scale drawing is a pure scene (`drawingScene()` → primitive nodes) rendered by React in the browser and serialised to an SVG string for the email PNG and the OG image, so `react-dom/server` is never imported in the React Server layer (where it throws).
5. **Next.js 16.4 is written from `node_modules/next/dist/docs`**, never from memory: cookie-less Supabase client inside `'use cache'`, `revalidateTag(tag, { expire: 0 })`, `useSearchParams` inside `<Suspense>`, `after()` for notifications, `serverExternalPackages` for `@resvg/resvg-js` and `@react-email/*`.
6. **One live database, additive migrations only**, through the `db-change` skill. Previews write to it: every lead records `source.environment`, and `NOTIFY_EMAIL` in Preview is the developer.
7. **Done means** lint, typecheck, test and build pass; Playwright + axe at 1440×900 and 390×844 show zero violations; screenshots are compared with DESIGN §4 and sent to the owner; the Vercel preview is checked by hand for anything the container cannot reach (Turnstile, Resend, Google Maps).

## Decisions taken (defaults; say so if you want a different one)

| Topic | Decision |
|---|---|
| Forms | Server Actions + `useActionState` + shared Zod v4 schemas in `src/lib/validation/schemas.ts`, with a thin client pre-pass of the same schema for focus-to-first-error and `aria-busy`. `react-hook-form` and `@hookform/resolvers` are removed in PR-1. |
| shadcn/ui | Not used in v1 (no DESIGN §3 component maps to a primitive). `ui.shadcn.com` stays blocked. Revisit only for `/admin`. |
| Consent | The DESIGN checkbox „Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.” on all three forms (the samples form too); its exact text is stored in `leads.consent_text`. Revisited after the lawyer's review (PR-8). |
| Prices | `settings.show_prices = false` until the workshop's price sheet arrives (PR-7). The ticket shows only „Prețul final îl confirmăm în scris…”, model cards drop the price row, the FAQ item „Cât costă un pat la comandă?” is hidden. `estimatePrice()` is tested with a fixture that is never rendered. |
| Samples | Built as designed with `sample_limit = 5` and bracket strings for cost and delivery, pending the workshop's answer (needed before PR-4 merges). |
| Reviews and projects before real content | Placeholder cards built only from the DESIGN templates („[Prenume], [Oraș]”, „[Recenzie]”, FOTO NN boxes) so the 1440/390 checks match the canvas. In production, section 07 hides when there are no published reviews and the hero ticket hides when no project is flagged `hero`. |
| WhatsApp | Buttons hidden while `settings.whatsapp_number` is empty or invalid; the number is normalised with `libphonenumber-js`. |
| Settings keys | ARHITECTURA §5 list minus `notify_email` (env only; `settings` is publicly readable) and minus `custom_size_range` (built from `CUSTOM_W`/`CUSTOM_L`), plus `installation_note`, `leg_height_cm`, `oil_refresh_interval`. `visits_note` is rendered wherever DESIGN hardcodes „cu programare”. |
| Schema additions | `bases.photo_path`, `projects.ticket_no` (for „Nr. [___]”), both additive. Material specs stay per family. |
| Footer | Legal row „© {an} [Denumire firmă SRL] · CUI [___] · [J__/____/____] · [Sediul social]”, year computed. |
| Header/footer | Links: Lucrări→`/lucrari`, Modele→`/#modele`, Materiale→`/materiale`, Configurator→`/configurator`, Atelierul→`/#atelier`, Contact→`/contact`; „Cere ofertă”→`/contact`. Standard mobile menu everywhere. `/configurator` and `/materiale`: no „Cere ofertă” button, compact footer. |
| Texts DESIGN leaves blank | 404: „Linkul e greșit sau pagina a fost mutată.” Legal stubs: „[Textul va fi furnizat de atelier și validat de jurist.]” Step 06 cards: „LED sub pat” / „Bandă de lumină discretă, sub cadru.” and „2 noptiere” / „Asortate cu patul, în același material.” `/contact` map: 400px. |
| Tokens | DESIGN §2.7 `@theme` verbatim plus `--color-on-dark: #F3F3F0` and `--color-error: #9B2C2C`. Ranges pinned once: buttons 52px (header 46px), H3 20px process / 19px model card, mono 12px (13px in the ticket). |
| Preview emails | Preview sends real emails to the developer (`NOTIFY_EMAIL`); `NOTIFY_DRY_RUN` unset. E2E submissions use `delivered@resend.dev` as the client address. |
| Revalidation | `/api/revalidate` accepts the Supabase Database Webhook payload and maps table → tag. The owner creates the webhooks in the Supabase dashboard at PR-7 (no secret in SQL). |
| Crons | Vercel Pro confirmed: `retry-notifications` every 15 min, `purge-pending` daily, `retention` weekly, in `vercel.json` with `"regions": ["fra1"]`. |
| CI | None in v1. The `ship` skill's checks plus the Vercel build gate every PR. |
| Playwright | `@playwright/test` pinned to **1.56.1** (the container's Chromium 1194; `cdn.playwright.dev` is blocked), `@axe-core/playwright`, run in-session against `next start`. Screenshots are read by Claude and sent to the owner, never committed. |
| Logo | DESIGN §3.1 text logo. Favicon and apple-touch-icon derived from the capitonat line-art mark. Swapped for a vector logo if the workshop delivers one. |
| JSON-LD | `FurnitureStore` with only the fields `settings` holds (no geo, no structured hours) in v1. |

## Pull requests

Each PR is one branch with a Vercel preview, finished in one or two cloud sessions. Order matters: each builds on the previous.

### PR-1 · Design system, site shell, configurator library, test harness (~2 sessions)

Goal: replace the scaffold with DESIGN §2 tokens and fonts, build every DESIGN §3 component, land `src/lib/configurator` with full tests, set up Playwright + axe, ship the pages that need no backend. Preview: styled shell, placeholder home inside it, 404, legal stubs.

- `src/app/globals.css`: the §2.7 `@theme` block, `@layer base`, textures from §2.4 (`.drafting`, `.photo-placeholder`, family patterns), focus and motion rules from §2.6.
- `src/app/layout.tsx`: `Archivo` (`axes: ['wdth']`, latin + latin-ext) and `DM_Mono` (400/500) through `next/font/google`; `lang="ro"`; Header/Footer.
- `src/components/site/`: `Header`, `MobileMenu` (client), `Footer` (full/compact), `Button` (primary/secondary/inverse/link, default/header sizes), `Eyebrow`, `SectionHeader`, `PageHeader` (breadcrumb + H1), `Photo` + `PhotoPlaceholder` (FOTO NN frame text from §8), `DimensionLine`, `Ticket`, `SpecList`, `Icons`; `src/components/site/form/`: `Label`, `Input`, `Select`, `Textarea`, `FileInput`, `Checkbox`, `FieldError`, `FormCard`.
- `src/components/drawings/BedLineArt.tsx` (§3.9 model cards, four headboard variants).
- `src/lib/configurator/`: `types.ts`, `catalog.seed.ts` (DESIGN §5.1 plus `Color.priceCategory?`, `supplierCode?`, `featured?`, `photoPath?`; `Family.tab`, `description`, `specs`), `rules.ts`, `geometry.ts`, `format.ts`, `pricing.ts`, `url.ts`, with the §12 tests next to them (`rules`, `geometry` snapshots for 8 combinations, `configCode`/`caption`, `estimatePrice`, URL round-trip).
- `src/lib/data/settings.seed.ts` (typed `Settings`, bracket strings), `projects.seed.ts`, `reviews.seed.ts` (placeholder rows from the DESIGN templates); readers `src/lib/data/{settings,catalog,projects,reviews}.ts` returning seeds for now.
- `src/lib/site-url.ts`: `NEXT_PUBLIC_SITE_URL` ?? `VERCEL_PROJECT_PRODUCTION_URL` ?? `VERCEL_URL`.
- Pages: `src/app/not-found.tsx`; `src/app/(site)/(legal)/layout.tsx` + `confidentialitate`, `cookies`, `termeni` stubs; `src/app/(site)/page.tsx` keeps the placeholder text inside the shell.
- Cleanup: Next's sample SVGs and favicon out; `icon.svg` + `apple-icon` in; `react-hook-form`, `@hookform/resolvers` removed; `libphonenumber-js`, `server-only` added.
- Harness: `@playwright/test@1.56.1`, `@axe-core/playwright`; `playwright.config.ts` (`tests/e2e`, projects desktop 1440×900 and mobile 390×844, `webServer: npm run start`); `tests/e2e/shell.spec.ts` (axe + screenshots of 404 and a legal page); `.gitignore` for test output.
- Done when: all four checks pass; axe zero on the shell pages at both widths; screenshots match §3.1/§3.17/§4.6/§4.7.

### PR-2 · Acasă, Lucrări, Contact and the contact request pipeline (~2–3 sessions)

Goal: the full home page and `/lucrari`, `/contact`, on seeds; the „Cerere de ofertă” form really submits: validated, protected, stored in `leads` with photos, both emails sent through Resend. After this PR the workshop has a site to show and requests arrive by email.

- Migration `supabase/migrations/<ts>_leads.sql` via `db-change`: enums `lead_kind`, `lead_status`; `public.is_admin()`; tables `leads` (email `not null`), `lead_files`, `lead_events`; RLS with `admin_all` only; bucket `lead-uploads` (private, 10 MB, jpeg/png/webp); indexes.
- `src/lib/supabase/admin.ts` (`import 'server-only'`, `SUPABASE_SECRET_KEY` read at call time); `src/lib/env.ts` for the other secrets.
- `src/lib/validation/schemas.ts`: `leadBaseSchema` (name 2–120, phone → E.164 default RO, **email required**, message ≤ 4000, consent), `contactSchema` (mattress size enum, ≤ 6 uploads with `pending/` prefix).
- `src/lib/security/`: `ip.ts` (`sha256(ip + IP_HASH_SALT)`), `form-token.ts` (HMAC-signed `startedAt`, minted by a Server Action on first interaction because pages are static), `turnstile.ts` (siteverify; off without site key), `rate-limit.ts` (5 leads per `ip_hash` per hour).
- `src/lib/leads/create-lead.ts`: the shared pipeline for all three forms (honeypot → token age → Turnstile → Zod → rate limit → insert → move uploads → `lead_files`).
- `src/actions/`: `issue-form-token.ts`, `create-upload-urls.ts` (signed upload URLs, 6 per call, 20 per IP per hour), `submit-contact.ts` with `after()` → `dispatchLeadNotifications`.
- `src/lib/notify/`: `email.ts` (Resend; `EMAIL_FROM`, `NOTIFY_EMAIL` env wins; `NOTIFY_DRY_RUN`), `subjects.ts`, `dispatch.ts` (writes `lead_events`); `src/emails/LeadToWorkshop.tsx`, `LeadConfirmation.tsx` (React Email, hook-free; `serverExternalPackages: ['@react-email/render', '@react-email/components']`).
- `next.config.ts` `headers()`: the ARHITECTURA §9 CSP with the project host, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.
- Client components: `ContactForm` (useActionState, hidden `company`/`startedAt`/`turnstileToken`/`source`, client pre-pass, confirmation screen), `FileUpload` (compression with `browser-image-compression`, signed upload), `Turnstile`, `MapEmbed` (click-to-load; needs CLAUDE.md rule 3 amended, else the static-image fallback).
- `src/components/home/`: `Hero`, `Facts`, `Process`, `Models`, `MaterialsTeaser`, `ConfiguratorBand`, `Gallery`, `Atelier`, `Reviews`, `Faq`, `ContactSection`; `src/app/(site)/page.tsx` in §4.1 order; `src/app/(site)/contact/page.tsx`; `src/app/(site)/lucrari/page.tsx` with the `?model=` filter.
- Tests: schemas, security helpers, subjects, the pipeline (honeypot, token age, rate limit, prefix check, consent text); `tests/e2e/home.spec.ts`, `contact.spec.ts`, `lucrari.spec.ts` (axe, screenshots, anchor offsets, FAQ toggles).
- Needs from the owner before merge: `RESEND_API_KEY`, `NOTIFY_EMAIL` (your address for Preview), `IP_HASH_SALT`, `FORM_HMAC_SECRET` on the Vercel env page; optional Turnstile keys (Cloudflare test pair in Preview). A real test request on the preview that arrives in your inbox.

### PR-3 · Configurator and the quote request (~2 sessions)

Goal: `/configurator` complete per DESIGN §4.2 and §5: six steps, the SVG drawing at scale with HTML dimension overlays, the ticket, the mobile bar, state in the URL, the WhatsApp link, and „Trimite configurația” storing the lead with code and price recomputed on the server and emailing the configurator variants (PNG attachment comes in PR-6).

- `src/lib/configurator/scene.ts` (`drawingScene(resolved, { mode })` → primitive nodes; `svgString()` serialiser); `src/components/drawings/BedDrawing.tsx` (scene → JSX, `aria-hidden`), `DrawingFigure`, `DimensionOverlay`.
- `src/components/configurator/`: `Configurator` (client root; config in state, URL via `history.replaceState`, `useSearchParams` in `<Suspense>`), `steps/StepModel|Size|Material|Headboard|Base|Extras`, `TicketPanel`, `QuoteForm`, `MobileBar`, `HeadboardIcon`.
- `src/app/(tools)/configurator/page.tsx` (static shell; `pricing` only when `show_prices`); `quoteSchema`; `src/actions/submit-quote.ts` (server `resolve()` → `configCode()` → `estimatePrice()`).
- Tests: `Configurator.test.tsx` (aria-pressed per step, resets on model/family change, code updates), `submit-quote.test.ts`; `tests/e2e/configurator.spec.ts` (options → URL and code change, custom size, submit with Turnstile test keys, confirmation with the code).
- Needs from the owner before merge: the workshop's yes/no on the closed sets (models Capitonat/Arcuit/Canale/Lamele, heights 100/120/140, bases lemn/metal/ladă/sertare, extras LED + 2 noptiere, families catifea/bouclé/stofă/piele ecologică/lemn masiv).

### PR-4 · Materiale and the samples request (~1.5 sessions)

Goal: `/materiale` per DESIGN §4.3: three tabs with counters, five family articles with specs, wood finishes and bases cards, swatch tiles filling the sticky sample box (`localStorage` `mostre:v1`, read after mount), and the box's form storing the lead and emailing the code list to the workshop.

- `src/components/materials/`: `MaterialsBrowser` (client root), `SwatchTile` (`aria-pressed`, `aria-label`), `SampleBox`, `SamplesForm`; `src/app/(tools)/materiale/page.tsx`.
- `samplesSchema` (1…`sample_limit` active ids, address required); `src/actions/submit-samples.ts`; `src/emails/SamplesToWorkshop.tsx`, `SamplesConfirmation.tsx`.
- Tests: `SwatchTile`, `SampleBox` (limit, sixth blocked, remove, storage round trip); `tests/e2e/materiale.spec.ts`.
- Needs from the owner before merge: the workshop's answer on samples (yes/no, limit, free or paid, courier days).

### PR-5 · Content in the database, cached readers, revalidation (~1.5 sessions)

Goal: move settings, catalog, projects and reviews from TypeScript seeds into the live database with RLS, switch the readers to `'use cache'` + `cacheTag` + `cacheLife('days')` with the seed fallback, add the server-only pricing reader for „de la … lei”, and the revalidation route.

- Migrations via `db-change`: `<ts>_content.sql` (the nine content tables from ARHITECTURA §5 plus `bases.photo_path`, `projects.ticket_no`; `pricing`; `public_read` policies; bucket `media`), `<ts>_seed_content.sql` (settings id=1 with the bracket seed, `show_prices=false`, `sample_limit=5`; the DESIGN §5.1 catalog).
- `src/lib/supabase/public.ts` (cookie-less publishable client for cached reads; `server.ts` is never imported from `src/lib/data`); `src/lib/data/*.ts` reading rows → `Catalog`/`Settings`/projects/reviews; `src/lib/data/pricing.ts` (`server-only`, `getStartingPrices()`).
- `src/app/api/revalidate/route.ts` (`x-revalidate-secret`, Supabase payload → tag, `revalidateTag(tag, { expire: 0 })`); `images.remotePatterns` for the `media` bucket.
- Tests: row mappers, settings merge-over-seed, revalidate route (401, table map).
- Needs from the owner: `REVALIDATE_SECRET` on the Vercel env page.

### PR-6 · Drawing PNG in emails, OG image, crons, analytics, sitemap, robots (~1.5 sessions)

- `assets/fonts/DMMono-Regular.ttf` + OFL, embedded as base64 in `src/lib/notify/dm-mono.ts`; `src/lib/notify/drawing-png.ts` (`svgString()` → `@resvg/resvg-js` at 1600px with `fontBuffers`; `serverExternalPackages: ['@resvg/resvg-js']`); attachment on `LeadToWorkshop` and `LeadConfirmation` for configurator leads.
- `src/app/opengraph-image.tsx` from the same scene; `src/app/sitemap.ts`, `robots.ts`.
- `src/app/api/cron/[job]/route.ts` (`Authorization: Bearer CRON_SECRET`): `retry-notifications` (≤ 3 attempts, then alert email), `purge-pending` (24 h), `retention` (24/12/6 months, spam 30 days); `vercel.json` with `fra1` and the three schedules.
- `@vercel/analytics` + `@vercel/speed-insights` in the layout.
- Needs from the owner: `CRON_SECRET` on the Vercel env page.

### PR-7 · Real content: catalogue, prices, photos, settings, reviews, placeholder gate (~2 sessions)

- `scripts/import-catalog.ts` (`exceljs` + `tsx`): reads `05-catalog.xlsx` and **emits SQL migrations** (`<ts>_catalog_from_excel.sql`, `<ts>_pricing.sql`) applied through `db-change`, so no secret is needed in the session. Material codes are assigned once and never reused.
- Photos: the mechanism is decided before this PR (see the open question below); `project_photos`, `materials.photo_path/macro_path`, `bases.photo_path` rows written by SQL with real dimensions.
- `<ts>_settings_values.sql`, `<ts>_projects_reviews.sql` with the workshop's values and consents; `show_prices` set per the workshop's decision.
- `tests/e2e/no-placeholders.spec.ts`: every route at both widths fails on any visible `[`.
- Owner creates the Supabase Database Webhooks (Database → Webhooks) on the nine content tables with header `x-revalidate-secret`, pointing at the production `/api/revalidate`.
- Needs: everything in `docs/LISTA-ATELIER.md` §1–§9.

### PR-8 · Launch: domain, Resend sending domain, legal texts, JSON-LD, analytics events (~1.5 sessions)

- Lawyer-validated texts on the three legal pages; final consent wording.
- `JsonLd` (`FurnitureStore`), per-page metadata with `metadataBase` on the real domain, the eight `track()` events.
- Owner checklist in the PR: `.ro` domain on the workshop's company → Vercel; DNS; Resend domain verified (SPF, DKIM, `_dmarc p=none`); `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, Production `NOTIFY_EMAIL` = the workshop; Turnstile hostname; webhook re-pointed; DPAs signed; Google Business Profile link.
- Done when: Playwright suite green against production, Lighthouse ≥ 95 on mobile, and a real request from a phone reaches the workshop.

### Deferred (after launch, ARHITECTURA §13 phase 6)

`/admin` (Supabase Auth magic link, `is_admin()`), `/modele/[model]` SEO pages, the Lucrări lightbox and „Vreau unul asemănător”, CI if wanted.

## What the workshop must provide, and when

| Needed before | What (see `docs/LISTA-ATELIER.md`) |
|---|---|
| PR-3 merges | Confirmation of the configurator sets (models, heights, bases, extras, families) |
| PR-4 merges | Samples at home: yes/no, limit, free or paid, courier and days |
| PR-7 starts | `05-catalog.xlsx` (all sheets, price category A/B/C per colour), photos (FOTO 01–08, projects, swatches, legs, atelier), company data (§1), decisions (§2: prices public, measurements, delivery, response time, deposit), texts from the 30-minute talk (§3), 3–6 reviews with written consent |
| PR-8 starts | Domain on the workshop's company, a mailbox on it, lawyer-validated legal texts, Google Business Profile link and manager access, vector logo if any |

## Owner setup checklist (Vercel → Project → Settings → Environment Variables; values never in chat)

| Before | Variables |
|---|---|
| PR-2 | `RESEND_API_KEY` (Resend account, EU region if offered), `NOTIFY_EMAIL` (your address, Preview + Development), `IP_HASH_SALT`, `FORM_HMAC_SECRET` (random, `openssl rand -base64 32`); optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (Cloudflare; the public test pair in Preview) |
| PR-5 | `REVALIDATE_SECRET` |
| PR-6 | `CRON_SECRET` (exactly that name) |
| PR-8 | `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, Production `NOTIFY_EMAIL`, Production Turnstile keys |

The three Supabase variables come from the Vercel integration. Vercel Pro and Supabase Pro are confirmed.

## Open question for PR-7: how photos get into the `media` bucket

Cloud sessions hold no secrets and the Supabase connector cannot upload Storage objects. Options: (a) the owner drags the prepared photos into the bucket in Supabase Studio and the session writes the rows by SQL; (b) a manual-dispatch GitHub Actions workflow with `SUPABASE_SECRET_KEY` as a repository secret runs `scripts/upload-media.ts` against a `content/` folder committed to a branch. Decide before PR-7.

## Risks

- `react-dom/server` throws in the React Server layer: emails go through externalised `@react-email/*`; the drawing goes through the scene serialiser. Never import `react-dom/server` in an action, route handler or `opengraph-image`.
- `@resvg/resvg-js` is a native addon: externalised, Node runtime, font shipped as base64 (file tracing is unreliable for a static route's action).
- Builds have no env in the session: one reader without the seed fallback breaks `npm run build` for every later PR.
- Previews write to the live database: additive migrations only; test leads are tagged with `source.environment` and purged as spam by the retention job.
- The container cannot reach Turnstile, Google Maps, Resend or Supabase: submission flows are verified on the Vercel preview by the owner.
- The workshop's deliverables are the critical path for PR-7 and PR-8; photos most of all.
