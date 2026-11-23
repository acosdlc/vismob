# Build plan

How VisMob gets built after setup (phase 0, pull request #1). It replaces the phase list in `docs/ARHITECTURA.md` §13 with pull-request-sized steps; the rest of that document and `docs/DESIGN.md` stay the specification. Where this file settles something the other documents leave open, this file wins.

## Principles

1. **A page ships only whole.** A route either does not exist yet (404) or matches `docs/DESIGN.md` §4 in every section, including a form whose Server Action is live. No disabled submit buttons, no fake confirmations.
2. **Placeholders are data, never copy.** Every `[...]` on screen comes from typed seeds (`settings.seed.ts`, `catalog.seed.ts`, `projects.seed.ts`, `reviews.seed.ts`) holding the exact DESIGN §8 bracket strings. Components contain only DESIGN's own text. Nothing is invented: no reviews, no prices, no cities. A line whose value is empty (Google rating, price, WhatsApp number, Instagram, a colour's supplier code) hides itself.
3. **Every PR builds with zero environment variables** in the cloud session: env is read at request time; data readers fall back to the seeds when `NEXT_PUBLIC_SUPABASE_URL` is absent and throw when `VERCEL_ENV === 'production'`; Turnstile is on only with both of its keys (with one missing it is off and says so in the logs), a missing Resend key means "log only" everywhere except Production, where the send fails, is recorded as failed, and the retry job spends no attempt until the variable is there (PR-13).
4. **Logic in `src/lib`, pure and tested; components only render.** The scale drawing is a pure scene (`drawingScene()` → primitive nodes) rendered by React in the browser and serialised to an SVG string for the email PNG and the OG image, so `react-dom/server` is never imported in the React Server layer (where it throws).
5. **Next.js 16.4 is written from `node_modules/next/dist/docs`**, never from memory: cookie-less Supabase client inside `'use cache'`, `revalidateTag(tag, { expire: 0 })`, `useSearchParams` inside `<Suspense>`, `after()` for notifications, `serverExternalPackages` for `@resvg/resvg-js` and `@react-email/*`.
6. **One live database, additive migrations only**, through the `db-change` skill. Previews write to it: every lead records `source.environment`, and `NOTIFY_EMAIL` in Preview is the developer.
7. **Done means** lint, typecheck, test and build pass; Playwright + axe at 1440×900 and 390×844 show zero violations; screenshots are compared with DESIGN §4 and sent to the owner; the Vercel preview is checked by hand for anything the container cannot reach (Turnstile, Resend, Google Maps).

## Decisions taken (defaults; say so if you want a different one)

| Topic | Decision |
|---|---|
| Forms | Server Actions + `useActionState` + shared Zod v4 schemas in `src/lib/validation/schemas.ts`, with a thin client pre-pass of the same schema for focus-to-first-error and `aria-busy`. `react-hook-form` and `@hookform/resolvers` are removed in PR-1. |
| shadcn/ui | Not used in v1 (no DESIGN §3 component maps to a primitive). `ui.shadcn.com` stays blocked. Revisit only for `/admin`. |
| Consent | The DESIGN checkbox „Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.” on both forms; its exact text is stored in `leads.consent_text`. Revisited after the lawyer's review (PR-12). |
| Prices | `settings.show_prices = false` until the workshop's price sheet arrives (PR-11). The ticket shows only „Prețul final îl confirmăm în scris…”, model cards drop the price row, the FAQ item „Cât costă un pat la comandă?” is hidden. `estimatePrice()` is tested with a fixture that is never rendered. With `show_prices` on, that FAQ item states the lowest of the model cards' „de la … lei” prices (`lowestStartingPrice()`), and stays hidden while no model has a price. |
| Samples | Removed in PR-6 (2026-10-21): the workshop does not send samples; `/materiale` is a library whose swatches open the configurator. |
| Reviews and projects before real content | Placeholder cards built only from the DESIGN templates („[Prenume], [Oraș]”, „[Recenzie]”, FOTO NN boxes) so the 1440/390 checks match the canvas. In production, section 07 hides when there are no published reviews and the hero ticket hides when no project is flagged `hero`. |
| WhatsApp | Buttons hidden while `settings.whatsapp_number` is empty or invalid. Setări takes digits only (8 to 15), reads them with `libphonenumber-js` first as an international number, then as a Romanian national one, and stores the E.164 digits without „+” (0722123456 and 40722123456 both become 40722123456). |
| Settings keys | ARHITECTURA §5 list minus `notify_email` (env only; `settings` is publicly readable) and minus `custom_size_range` (built from `CUSTOM_W`/`CUSTOM_L`), plus `installation_note`, `leg_height_cm`, `oil_refresh_interval`. `visits_note` is rendered wherever DESIGN hardcodes „cu programare”. |
| Schema additions | `bases.photo_path`, `projects.ticket_no` (for „Nr. [___]”), both additive. Material specs stay per family. |
| Footer | Legal row „© {an} [Denumire firmă SRL] · CUI [___] · [J__/____/____] · [Sediul social]”, year computed. |
| Header/footer | Links: Lucrări→`/lucrari`, Modele→`/#modele`, Materiale→`/materiale`, Configurator→`/configurator`, Atelierul→`/#atelier`, Contact→`/contact`; „Cere ofertă”→`/contact`. Standard mobile menu everywhere. `/configurator` and `/materiale`: no „Cere ofertă” button, compact footer. |
| Texts DESIGN leaves blank | 404: „Linkul e greșit sau pagina a fost mutată.” Legal stubs: „[Textul va fi furnizat de atelier și validat de jurist.]” Step 06 cards: „LED sub pat” / „Bandă de lumină discretă, sub cadru.” and „2 noptiere” / „Asortate cu patul, în același material.” `/contact` map: 400px. |
| Tokens | DESIGN §2.7 `@theme` verbatim plus `--color-on-dark: #F3F3F0` and `--color-error: #9B2C2C`. Ranges pinned once: buttons 52px (header 46px), H3 20px process / 19px model card, mono 12px (13px in the ticket). |
| Preview emails | Preview sends real emails to the developer (`NOTIFY_EMAIL`); `NOTIFY_DRY_RUN` unset. E2E submissions use `delivered@resend.dev` as the client address. |
| Revalidation | `/api/revalidate` (PR-5) accepts the Supabase Database Webhook payload and maps table → tag. No Database Webhooks are created: from PR-7 on, every admin save expires its own tag with `updateTag` (see PR-11). |
| Admin design | No new tokens or components: `/admin` composes the site's tokens, type roles and §3 components (DESIGN §4.8, `src/components/admin/ui.tsx`). Sign-in is a Server Action (`signInWithPassword` through the cookie client), so no auth code runs in the browser; the proxy only redirects anonymous navigations (GET, HEAD), the `(panel)` layout is the authority for every screen and each Server Action for itself (PR-13). |
| Crons | Vercel Pro confirmed: `retry-notifications` every 15 min, `purge-pending` daily, `retention` weekly, in `vercel.json` with `"regions": ["fra1"]`. |
| Retention | ARHITECTURA §9 as written: requests without an order after 24 months, request photos after 12 months, spam and preview/development test requests after 30 days, `pending/` uploads after 24 h; `ip_hash` nulled after 6 months (it only serves the one-hour rate limit). The retry alert is recorded in the failed event's `detail` (`lead_events.type` stays the two email types). |
| CI | None in v1. The `ship` skill's checks plus the Vercel build gate every PR. |
| Playwright | `@playwright/test` pinned to **1.56.1** (`cdn.playwright.dev` is blocked, so no browser can be downloaded); `playwright.config.ts` launches the container's own Chromium behind `/opt/pw-browsers/chromium`, whatever build it ships (1194 in October 2026, 1243 in November), `PLAYWRIGHT_CHROMIUM_PATH` overriding it. `@axe-core/playwright`, run in-session against `next start`. Screenshots are read by Claude and sent to the owner, never committed. |
| Logo | DESIGN §3.1 text logo. Favicon and apple-touch-icon derived from the capitonat line-art mark. Swapped for a vector logo if the workshop delivers one. |
| JSON-LD | `FurnitureStore` with only the fields `settings` holds (no geo, no structured hours) in v1. |
| Analytics events | The six ARHITECTURA §10 events through `trackEvent()` (`src/lib/analytics.ts`); `TrackedLink` is the one client component outside rule 3, for the WhatsApp and phone buttons rendered by Server Components. `phone_click` counts the header's phone link and the „Sună acum” buttons, the places that invite a call; the plain number in the footer and in the contact details is not counted. |
| Placeholder gate | `tests/e2e/no-placeholders.spec.ts` runs only with `PLACEHOLDER_GATE=1`, against a deployment whose content is entered; the container's seed still carries placeholders. It fails on a `[` in the visible text, the title or the description, and on any visible FOTO box; it opens every closed answer and every tab of `/materiale` first (PR-13). |
| Error screens | `src/app/admin/(panel)/error.tsx` and `src/app/global-error.tsx` are Client Components because Next.js requires it of error files: the second exception to rule 3, accepted by the owner on 2026-11-23. Their texts: „Ceva nu a mers.”, „Pagina nu s-a putut încărca. Verifică legătura la internet și încearcă din nou.”, „Încearcă din nou”. |
| Multi-line texts | Line breaks typed in the panel's multi-line boxes show wherever a whole value is printed (`white-space: pre-line` on the SpecList value, the FAQ answer, the review, the family description and the model card text); the two inline uses collapse them (`story_text` inside the Atelier paragraph, `registered_office` in the footer's legal row). Every form parser reads its strings through `formValues`, which turns CR LF into LF, so a limit counts a line break once. |
| Launch domain | `vismob.app`, bought through Vercel on 2026-11-23 and confirmed by the owner as the launch domain; the `.ro` plan is dropped. |
| Photos tooling | `scripts/upload-media.ts` is not written: the admin's browser upload (PR-8/9) covers every photo; the Supabase Studio fallback stays for bulk drops. |
| Catalogue import | `docs/atelier/05-catalog.xlsx` is the template the workshop fills; `npm run catalog:import <file>` emits the two SQL migrations for `db-change`. |

## Pull requests

Each PR is one branch with a Vercel preview, finished in one or two cloud sessions. Order matters: each builds on the previous.

### PR-1 · Design system, site shell, configurator library, test harness (~2 sessions) — merged

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
- Harness: `@playwright/test@1.56.1`, `@axe-core/playwright`; `playwright.config.ts` (`tests/e2e`, projects desktop 1440×900 and mobile 390×844, `webServer: npm run start`); `tests/e2e/home.spec.ts` (axe + screenshots of the home, a legal page and the 404); `.gitignore` for test output.
- Done when: all four checks pass; axe zero on the shell pages at both widths; screenshots match §3.1/§3.17/§4.6/§4.7.

### PR-2 · Acasă, Lucrări, Contact and the contact request pipeline (~2–3 sessions) — merged

Goal: the full home page and `/lucrari`, `/contact`, on seeds; the „Cerere de ofertă” form really submits: validated, protected, stored in `leads` with photos, both emails sent through Resend. After this PR the workshop has a site to show and requests arrive by email.

- Migration `supabase/migrations/<ts>_leads.sql` via `db-change`: enums `lead_kind`, `lead_status`; `public.is_admin()`; tables `leads` (email `not null`), `lead_files`, `lead_events`; RLS with `admin_all` only; bucket `lead-uploads` (private, 10 MB, jpeg/png/webp); indexes.
- `src/lib/supabase/admin.ts` (`import 'server-only'`, `SUPABASE_SECRET_KEY` read at call time); `src/lib/env.ts` for the other secrets.
- `src/lib/validation/schemas.ts`: `leadBaseSchema` (name 2–120, phone → E.164 default RO, **email required**, message ≤ 4000, consent), `contactSchema` (mattress size enum, ≤ 6 uploads with `pending/` prefix).
- `src/lib/security/`: `ip.ts` (`sha256(ip + IP_HASH_SALT)`), `form-token.ts` (HMAC-signed `startedAt`, minted by a Server Action on first interaction because pages are static), `turnstile.ts` (siteverify; off without site key), `rate-limit.ts` (5 leads per `ip_hash` per hour).
- `src/lib/leads/create-lead.ts`: the shared pipeline for every form (honeypot → token age → Turnstile → Zod → rate limit → insert → move uploads → `lead_files`).
- `src/actions/`: `issue-form-token.ts`, `create-upload-urls.ts` (signed upload URLs, 6 per call, 20 per IP per hour), `submit-contact.ts` with `after()` → `dispatchLeadNotifications`.
- `src/lib/notify/`: `email.ts` (Resend; `EMAIL_FROM`, `NOTIFY_EMAIL` env wins; `NOTIFY_DRY_RUN`), `subjects.ts`, `dispatch.ts` (writes `lead_events`); `src/emails/LeadToWorkshop.tsx`, `LeadConfirmation.tsx` (React Email, hook-free; `serverExternalPackages: ['@react-email/render', '@react-email/components']`).
- `next.config.ts` `headers()`: the ARHITECTURA §9 CSP with the project host, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.
- Client components: `ContactForm` (useActionState, hidden `website` (honeypot)/`startedAt`/`turnstileToken`/`source`, client pre-pass, confirmation screen), `FileUpload` (compression with `browser-image-compression`, signed upload), `Turnstile`, `MapEmbed` (click-to-load; needs CLAUDE.md rule 3 amended, else the static-image fallback).
- `src/components/home/`: `Hero`, `Facts`, `Process`, `Models`, `MaterialsTeaser`, `ConfiguratorBand`, `Gallery`, `Atelier`, `Reviews`, `Faq`, `ContactSection`; `src/app/(site)/page.tsx` in §4.1 order; `src/app/(site)/contact/page.tsx`; `src/app/(site)/lucrari/page.tsx` with the `?model=` filter.
- Tests: schemas, security helpers, subjects, the pipeline (honeypot, token age, rate limit, prefix check, consent text); `tests/e2e/home.spec.ts`, `contact.spec.ts`, `lucrari.spec.ts` (axe, screenshots, anchor offsets, FAQ toggles).
- Needs from the owner before merge: `RESEND_API_KEY`, `NOTIFY_EMAIL` (your address for Preview), `IP_HASH_SALT`, `FORM_HMAC_SECRET` on the Vercel env page; optional Turnstile keys (Cloudflare test pair in Preview). A real test request on the preview that arrives in your inbox.

### PR-3 · Configurator and the quote request (~2 sessions) — merged

Goal: `/configurator` complete per DESIGN §4.2 and §5: six steps, the SVG drawing at scale with HTML dimension overlays, the ticket, the mobile bar, state in the URL, the WhatsApp link, and „Trimite configurația” storing the lead with code and price recomputed on the server and emailing the configurator variants (PNG attachment comes in PR-10).

- `src/lib/configurator/scene.ts` (`drawingScene(resolved, { mode })` → primitive nodes; `svgString()` serialiser); `src/components/drawings/BedDrawing.tsx` (scene → JSX, `aria-hidden`), `DrawingFigure`, `DimensionOverlay`.
- `src/components/configurator/`: `Configurator` (client root; config in state, URL via `history.replaceState`, `useSearchParams` in `<Suspense>`), `steps/StepModel|Size|Material|Headboard|Base|Extras`, `TicketPanel`, `QuoteForm`, `MobileBar`, `HeadboardIcon`.
- `src/app/(tools)/configurator/page.tsx` (static shell; `pricing` only when `show_prices`); `quoteSchema`; `src/actions/submit-quote.ts` (server `resolve()` → `configCode()` → `estimatePrice()`).
- Tests: `Configurator.test.tsx` (aria-pressed per step, resets on model/family change, code updates), `submit-quote.test.ts`; `tests/e2e/configurator.spec.ts` (options → URL and code change, custom size, submit with Turnstile test keys, confirmation with the code).
- Needs from the owner before merge: the workshop's yes/no on the closed sets (models Capitonat/Arcuit/Canale/Lamele, heights 100/120/140, bases lemn/metal/ladă/sertare, extras LED + 2 noptiere, families catifea/bouclé/stofă/piele ecologică/lemn masiv).

### PR-4 · Materiale and the samples request (~1.5 sessions) — merged, the samples request undone in PR-6

Goal: `/materiale` per DESIGN §4.3: three tabs with counters, five family articles with specs, wood finishes and bases cards, swatch tiles filling the sticky sample box (`localStorage` `mostre:v1`, read after mount), and the box's form storing the lead and emailing the code list to the workshop.

- `src/components/materials/`: `MaterialsBrowser` (client root), `SwatchTile` (`aria-pressed`, `aria-label`), `SampleBox`, `SamplesForm`; `src/app/(tools)/materiale/page.tsx`.
- `samplesSchema` (1…`sample_limit` active ids, address required); `src/actions/submit-samples.ts`; `src/emails/SamplesToWorkshop.tsx`, `SamplesConfirmation.tsx`.
- Tests: `SwatchTile`, `SampleBox` (limit, sixth blocked, remove, storage round trip); `tests/e2e/materiale.spec.ts`.
- Needs from the owner before merge: the workshop's answer on samples (yes/no, limit, free or paid, courier days).

### PR-5 · Content in the database, cached readers, revalidation (~1.5 sessions) — merged

Goal: move settings, catalog, projects and reviews from TypeScript seeds into the live database with RLS, switch the readers to `'use cache'` + `cacheTag` + `cacheLife('days')` with the seed fallback, add the server-only pricing reader for „de la … lei”, and the revalidation route.

- Migrations via `db-change`: `<ts>_content.sql` (the nine content tables from ARHITECTURA §5 plus `bases.photo_path`, `projects.ticket_no`; `pricing`; `public_read` policies; bucket `media`), `<ts>_seed_content.sql` (settings id=1 with the bracket seed, `show_prices=false`, `sample_limit=5`; the DESIGN §5.1 catalog).
- `src/lib/supabase/public.ts` (cookie-less publishable client for cached reads; `server.ts` is never imported from `src/lib/data`); `src/lib/data/*.ts` reading rows → `Catalog`/`Settings`/projects/reviews (the `public_read` policies read `using (active)`; from PR-13 the catalogue reader also filters on `active` itself, because the `public_read_in_project` policies let a switched-off colour or base be read when a published project uses it, and without the reader's own filter those rows would return to the configurator and to Materiale); `src/lib/data/pricing.ts` (`server-only`, `getStartingPrices()`).
- `src/app/api/revalidate/route.ts` (`x-revalidate-secret`, Supabase payload → tag, `revalidateTag(tag, { expire: 0 })`); `images.remotePatterns` for the `media` bucket.
- Tests: row mappers, settings merge-over-seed, revalidate route (401, table map).
- Needs from the owner: `REVALIDATE_SECRET` on the Vercel env page.

### PR-6 · Remove samples (~1 session) — merged

Goal: act on the owner's decision of 2026-10-21: the workshop does not send material samples, of any kind. `/materiale` stays a library whose swatches open the configurator, and everything about the sample box goes from the code, the texts, the tests and the documents.

- Code out: `SampleBox`, `SamplesForm`, `samplesSchema`, `src/actions/submit-samples.ts`, `src/emails/SamplesToWorkshop.tsx` and `SamplesConfirmation.tsx`, the `mostre` lead kind in the pipeline and the subjects, the fixed „Cutia ({n})” button, the `localStorage` key `mostre:v1`, and the settings keys `sample_limit`, `samples_free`, `samples_delivery` in the `Settings` type and `settings.seed.ts`.
- `/materiale` per the new DESIGN §4.3: the content on the full width (no aside), the three tabs with counters (`MaterialsBrowser` stays a client component only for them), the five family articles with description and specs, the wood finishes block and the bases cards. `SwatchTile` becomes a link to `/configurator?f=<family>&c=<color>` (`m=lamele` for the wood family, the default model otherwise) with the colour's name (14px 600) and its code (DM Mono 12px, muted) under it.
- Texts per DESIGN: §4.1 section 03 (paragraph, one button), the FAQ „Pot vedea materialele înainte?”, §4.2 step 03 link „Vezi toate materialele” and the confirmation (text, one button), §4.3 lead. The home teaser and the configurator step 03 keep their swatches.
- Migration via `db-change`: a narrow `update` of `settings.data` (id = 1) that removes the three keys. The enum value `'mostre'` and the columns `leads.address` and `leads.sample_material_ids` stay until the owner approves dropping them (a destructive migration).
- Tests: the `SampleBox` / `SamplesForm` / `samplesSchema` tests go; `tests/e2e/materiale.spec.ts` checks the tabs and that a tile opens the configurator with family and colour preselected; unit tests that referenced the three settings keys or the `mostre` kind are updated.
- Documents: DESIGN, ARHITECTURA, ARHITECTURA-NOTE, PLAN, LISTA-ATELIER, CLAUDE.md and README updated in the same PR.

### PR-7 · Admin shell: login, guard, dashboard, Setări, Cereri (~2 sessions) — merged

Goal: `/admin` exists and the workshop can sign in, read and work its requests and edit every setting without Supabase Studio. Everything in the admin reads and writes through the signed-in user's cookie client, under RLS; the secret key is never used there.

- `/admin/login`: email + password through Supabase Auth, in a Server Action (`signInWithPassword` on the cookie client `src/lib/supabase/server.ts`, which also reads the session server-side with `getClaims()`); the browser client stays unused. Magic link comes later, once Supabase email sending is pointed at Resend.
- `/admin` layout guard: session + `app_metadata.role = 'admin'` (granted by SQL; `is_admin()` checks the same claim in RLS), redirect to `/admin/login` otherwise; sign-out. `noindex` on `/admin`.
- Dashboard: the count of new requests (status `nou`).
- Setări: one form over every `Settings` key, grouped as in `settings.seed.ts`, with the `show_prices` switch; save → `updateTag("settings")`.
- Cereri: list with filters tip / status / perioadă and search; detail with the ticket, the configuration code, photos through signed URLs, `tel:` and WhatsApp buttons, the status select nou / contactat / ofertat / câștigat / pierdut / spam, notes, delete.
- Server Actions validated with Zod, each re-checking the role before touching data.
- Tests: schemas, actions, the guard; e2e: an unauthenticated visit to `/admin` redirects to `/admin/login`.
- Needs from the owner: the first user created in the Supabase dashboard (Authentication → Users → Add user) and that user's email, so the role can be granted.

### PR-8 · Admin catalogue and prices (~2 sessions) — merged

Goal: the workshop maintains its materials, the texts and photos of models, families and bases, the model ↔ family rules and the price grid itself.

- Materiale: CRUD with photo upload (resized in the browser, uploaded to the `media` bucket), supplier, supplier code, price category A/B/C, `featured`, `active`, sort.
- Modele, familii, baze: edit of names, notes, descriptions, specs, photos and `active`, plus the model ↔ family rules. No new models, families or bases from the admin: each has drawings and rules in code.
- Deleting a material or a base still referenced by a project is refused; the admin deactivates it instead.
- Prețuri: a form over `pricing.data` with a preview of the price for three typical configurations.
- Saves → `updateTag("catalog")` / `updateTag("pricing")`; from PR-13 the catalogue saves also expire `projects`.
- Tests: schemas and actions, including the refused delete and the rule edits.

### PR-9 · Admin lucrări and recenzii (~1.5 sessions) — merged

Goal: the workshop publishes its projects and reviews itself, with the consents recorded.

- Lucrări: CRUD with photos (upload, order, delete, alt text), client consent, `published`, `featured`, `hero` (only one project at a time; publishing needs the consent and, from PR-13, at least one photo; the hero must be published).
- Recenzii: CRUD with consent, `published`, order (publishing needs the consent).
- The workshop photo (FOTO 08, Acasă „Atelierul”): a `settings` key `atelier_photo_path` edited in Setări with the photo field, so every photo on the site is managed from the admin (materials and bases since PR-8, projects and the hero here).
- Saves → `updateTag("projects")` / `updateTag("reviews")` / `updateTag("settings")`.
- Tests: schemas and actions, including the single `hero` and the consent rules.

### PR-10 · Drawing PNG in emails, OG image, crons, analytics, sitemap, robots (~1.5 sessions) — merged

Goal: the content of the old PR-6, unchanged except `robots.ts` disallowing `/admin` and `/api`: the configurator emails carry the drawing as a PNG, the site gets its OG image, the three crons, analytics, a sitemap and robots.

- `assets/fonts/DMMono-Regular.ttf` + OFL, embedded as base64 in `src/lib/notify/dm-mono.ts`. The drawing sheet (scene, dimension lines, scale bar and caption, with every label an SVG `<text>` in DM Mono) is written by the pure `sheetSvg()` in `src/lib/configurator/sheet.ts`; `src/lib/notify/drawing-png.ts` renders it with `@resvg/resvg-js` at 1600px (`fontFiles` pointing at the embedded font, written once per process to the OS temp directory; `serverExternalPackages: ['@resvg/resvg-js']`). For configurator leads the PNG (`desen-{cod}.png`) is rendered once per dispatch and attached to both `LeadToWorkshop` and `LeadConfirmation`, which then mention it; if the rendering fails, the emails go out without it.
- `src/app/opengraph-image.tsx` (1200 × 630: the same sheet on drafting paper next to the workshop's name, in DM Mono); `src/app/sitemap.ts` (the eight public routes, `/lucrari` carrying the first photo of each published project as its image sitemap; no `lastModified`, `changeFrequency` or `priority`), `robots.ts` (`/admin` and `/api` disallowed, the `Sitemap:` line).
- `src/app/api/cron/[job]/route.ts` (`Authorization: Bearer CRON_SECRET`, a header Vercel adds itself; 503 while the secret is unset; Node runtime, `maxDuration` 60 s): `retry-notifications` (the failed `lead_events` of the last 7 days, at most 3 attempts per email, then one `NotificationAlert` email to `NOTIFY_EMAIL` with a link to `/admin/cereri/[id]`, noted as `alerted: true` in that failed event's `detail` so it is never sent twice; from PR-13 no attempt is made while the deployment cannot send at all, Production without `RESEND_API_KEY` or `EMAIL_FROM`: the run reports that one error and returns, `cannotSendReason()` in `src/lib/notify/email.ts`), `purge-pending` (`pending/` uploads and `upload_requests` older than 24 h), `retention` (ARHITECTURA §9: requests without an order after 24 months, request photos after 12 months, spam and preview/development test requests after 30 days, `ip_hash` nulled after 6 months; at most 200 leads per rule per run); `vercel.json` with `fra1` and the schedules `*/15 * * * *`, `20 3 * * *` and `40 4 * * 1`.
- `@vercel/analytics` + `@vercel/speed-insights` in the layout.
- Needs from the owner: `CRON_SECRET` on the Vercel env page.

### PR-11 · Real content: catalogue, prices, photos, settings, projects, reviews, placeholder gate (~2 sessions) — tooling shipped, content pending

Goal: the site shows only real data. The workshop enters its catalogue, prices, photos, settings, projects and reviews through `/admin` (PR-7 … PR-9); the session's job is the gate that proves no placeholder is left.

Shipped, in one pull request with the code half of PR-12 (nothing in it needs the workshop's materials):

- `docs/atelier/05-catalog.xlsx`, generated by `npm run catalog:template` (`scripts/make-catalog-template.ts`): the nine sheets of LISTA-ATELIER §8, with the configurator's closed sets pre-filled (models, families, bases, sizes, heights, the current colours with their codes and swatch colours, the rules matrix, the price grid's rows and the parameter keys), a short explanation above every table, and every price, text and supplier cell empty.
- `npm run catalog:import <file>` (`scripts/import-catalog.ts`; the logic in `scripts/catalog-workbook.ts`, tested with in-memory workbooks): validates a filled copy against the closed sets and the admin's own rules (`materialSchema`, `parsePricingForm`), lists every problem at once and exits 1, or writes `<ts>_catalog_from_excel.sql` (model, family and base texts; materials upserted by code, a new colour getting the next code of its family and never a freed one; the `model_families` rules per model) and `<ts>_pricing.sql` (the grid, passed through `pricingSchema`). Both are applied through `db-change`, never automatically. The sheets `Dimensiuni`, `Tăblii`, `Opționale` and `Termene` are informative: those sets live in code, the lead time in Setări.
- `tests/e2e/no-placeholders.spec.ts`: every `PUBLIC_ROUTES` entry, at both widths, fails on a `[` in the visible text, the title or the description. It runs only with `PLACEHOLDER_GATE=1`, against a deployment whose content is in (the command is in `docs/LAUNCH.md`); the container's seed still carries placeholders.

Remaining, once the workshop's materials arrive (`docs/LISTA-ATELIER.md` §1–§9):

- Content entry through the admin, in this order (`docs/ADMIN.md`, „Entering the content”): Setări (every key, `show_prices` per the workshop's decision, the Google Business Profile link, the atelier photo) → Catalog (family texts and specs, materials with photos, supplier codes and price categories, codes assigned once and never reused, base notes and photos) → Prețuri (the grid, or the Excel route above) → Lucrări (photos, consent, one `hero`) → Recenzii (consent).
- No Database Webhooks step: the admin expires its tags itself on every save (`updateTag`), so `/api/revalidate` is not wired to Supabase.
- Done when the placeholder gate passes against the preview.

### PR-12 · Launch: domain, Resend sending domain, legal texts, JSON-LD, analytics events (~1.5 sessions) — code shipped, launch pending

Goal: the content of the old PR-8, unchanged except the event count (six) and the dropped webhook item.

Shipped, with PR-11's tooling:

- `JsonLd` (`src/components/site/JsonLd.tsx`, the data from the pure `furnitureStoreJsonLd()` in `src/lib/seo/json-ld.ts`): one `FurnitureStore` script on Acasă with only the real `settings` values (name, `url`, telephone, email, the postal address, `sameAs` from the Instagram, Facebook and Google Business Profile links, the OG image as `image`); a value that still carries `[` is left out, and the script is absent while the name itself is a placeholder.
- Per-page metadata: a Romanian `description` taken from each page's DESIGN lead and `alternates.canonical` on every public route (the legal pages get the canonical only); `openGraph` (`website`, `ro_RO`, the workshop's name) in the root layout, on `metadataBase` = `siteUrl()`, which becomes the real domain through `NEXT_PUBLIC_SITE_URL`.
- The six ARHITECTURA §10 events through `trackEvent()` (`src/lib/analytics.ts`), a wrapper of `@vercel/analytics`' `track` that never throws: `config_start` once per Configurator mount, on the visitor's first change (not on mount, not when the URL already carries a configuration that is left alone); `config_step` with `{ step }` (`model` | `size` | `material` | `headboard` | `base` | `extras`) on every change in that step; `quote_submit` with `{ code }` when the configurator's form reaches its `ok` state and `contact_submit` when the contact form does, once per success; `whatsapp_click` with `{ place: "configurator" | "contact" }` on the ticket's and the contact section's WhatsApp buttons; `phone_click` with `{ place: "header" | "contact" }` on the header's `tel:` link and the contact section's button. The buttons rendered by Server Components go through `TrackedLink` (see Decisions).
- `docs/LAUNCH.md`: the owner's launch checklist, each item with who does it.

Remaining, at launch (`docs/LAUNCH.md` is the checklist):

- Lawyer-validated texts on the three legal pages and the final consent wording: a pull request once the texts arrive.
- The domain is `vismob.app` (bought through Vercel on 2026-11-23, DNS on Vercel, already attached to the project; the `.ro` plan is dropped). Still to do: the Resend domain verified (SPF, DKIM, `_dmarc p=none`); `NEXT_PUBLIC_SITE_URL` pinned, `EMAIL_FROM`, Production `NOTIFY_EMAIL` = the workshop, Production Turnstile keys and hostname, `CRON_SECRET`, `FORM_HMAC_SECRET`; DPAs signed; the Google Business Profile link in Setări; the admin password changed by the owner; `vismob.dev` turned into a redirect.
- Done when: the placeholder gate and the Playwright suite are green against production, Lighthouse ≥ 95 on mobile, and a real request from a phone reaches the workshop.

### PR-13 · Fixes and rules found at handover (~2 sessions) — in review

Goal: the panel is safe to hand to a non-technical person. While the handover guide was written, the code was read screen by screen; 55 suspected defects were checked against the code, 48 held, and the ones below were fixed, each with a test written first. Two independent reviews followed, each finding challenged by a second reader before it was fixed.

Session and saving:

- The proxy redirects an anonymous visitor to `/admin/login` only on GET and HEAD. A Server Action call is a POST to the page's own address: it now reaches the action, which answers „Sesiunea a expirat sau nu ai acces. Intră din nou în cont.” with the typed text kept, instead of the framework's English error screen. So nothing but the action's first two lines stops an anonymous call: `src/actions/admin/session-check.test.ts` reads every module under `src/actions/admin`, at any depth, and fails when an action does not open with the session check or is exported in any form but `export async function name(` at the start of a line (`export type` and `export interface` are allowed; only `signIn` and `signOut` are let off the two opening lines).
- „Ieși” ends the session of that browser only (`scope: "local"`).
- „Salvat.” speaks only for what the last submit carried: it hides at the first edit and returns after the next successful save (`useSavedNotice`, in the ten forms).
- A Server Action call that brings no answer (a dropped connection, a deployment made meanwhile) leaves the form mounted with what was typed and shows the form's own error (`useGuardedActionState`, in the ten admin forms and the two public ones); the redirect after a create or a delete still passes. Two Romanian error screens replace the framework's (see Decisions, „Error screens”).

Setări:

- Every text is required, except the keys the site hides when empty (`google_rating`, `google_reviews_count`, `story_text`; links, WhatsApp and the photo are optional by kind). A `[...]` placeholder is not empty and still passes.
- „Telefon” and „Email” are checked: one phone number that dials as typed (digits, spaces, `+ . - ( )`), one valid address; „Telefon” carries a hint with the two accepted spellings. Their placeholder passes only as one whole bracket („[07xx xxx xxx]”): a real number or address with a note in brackets is checked like any other. WhatsApp is normalised (see Decisions).
- A save is refused when the stored row changed since the page was loaded: a SHA-256 fingerprint of `settings.data` posted in a hidden input, no version column; the answer is „Setările au fost schimbate între timp din altă fereastră. Reîncarcă pagina și reia modificarea.”

Catalogue and prices:

- The specification grid of a family is rebuilt from the stored rows after a save that changed them (it used to double or drop a row on the next save); the Materiale page prints every filled row, up to six. While the save runs the grid's boxes are read-only, and after a save sent with Enter from a grid box the focus returns to the box of the same name.
- A new colour whose „Ordine” is left empty goes last in its family; on an existing colour an emptied „Ordine” is refused with the texts the forms already use („Verifică câmpurile marcate.”, „Completează acest câmp.”), and a typed 0 is kept.
- Catalogue saves expire `catalog` and `projects`: project captions and the hero ticket carry colour, family and base names.
- The public catalogue reader filters on `active` itself. The migration `public_read_materials_bases_in_projects` adds one select policy on `materials` and one on `bases` for rows a published project with consent refers to, so a switched-off colour or base stays in that project's caption.
- A family no active model allows, and a base that is switched off, leave `/materiale` and the home swatches.
- Prices: a grid cell above 0 and under 100 lei is refused as a thousands-separator slip (`LEI_FLOOR`, shared with the Excel import); for the four bases and the two extras an amount under 100 lei is saved, and only the slip's shape is refused (one to three digits, a point, three digits: 1.200), with the same message. The grid hint says what an empty cell does: the width stays in the configurator and takes the price of the next filled width or, with none wider, of the widest filled one.
- A photo is checked against the 10 MB limit after the browser resized it, not before, so an original of any size can be picked. „Poza e încărcată; apare pe site după ce salvezi.” and „Poza se șterge când salvezi.” show only until the save that carries the photo went through.

Lucrări and Cereri:

- A project is published only with the client's consent and at least one photo: a new project is saved unpublished, gets its photos on its own screen, then is published; the last photo of a published project cannot be deleted. While „Salvează pozele” runs, the „Adaugă o poză” block is held (picker disabled, text read-only), so nothing picked or typed then is dropped with it.
- The configuration sheet of a request is resolved against the whole catalogue, inactive rows included, with a notice when its code no longer matches the stored one.

Public site and notifications:

- A colour without a supplier code prints no „[cod furnizor]”. The FAQ price question shows when prices are public (see Decisions, „Prices”).
- Line breaks typed in the panel show on the site (see Decisions, „Multi-line texts”).
- In Production a missing `RESEND_API_KEY` or `EMAIL_FROM` fails the send, and the retry job waits without spending attempts while the deployment cannot send at all; Turnstile is on only with both keys; the retry job leaves requests of other environments alone.
- The placeholder gate also fails on FOTO boxes (see Decisions).

Left for later, each confirmed and small: the address first asked for is not remembered through the sign-in; „Adăugat.” and „Șters.” repeat on a reload; a missing record under `/admin` shows the public 404; an upload that is never saved stays in the bucket; the hero switch and the model save are several writes; the home heading says „Patru modele” with fewer active; no limit on the home swatches; a deleted colour's code can be reissued when it was the family's highest; a model renamed in the panel does not reach the project captions; an emptied „Ordine” is stored as 0 for models, bases, projects, photo rows and reviews (no hint says otherwise there); after Enter in the alternative text of a new photo the focus falls to the page; the Excel import still refuses any base amount under 100 lei and does not check the two extras for the thousands-point slip, so its pricing migration is read before it is applied; the grid hint does not say that a model whose row is entirely empty has no price.

### Deferred (after launch, ARHITECTURA §13 phase 6)

`/modele/[model]` SEO pages, the Lucrări lightbox and „Vreau unul asemănător”, CI if wanted. Also: magic-link sign-in for `/admin` (once Supabase email sending goes through Resend), and dropping the unused enum value `'mostre'` and the columns `leads.address`, `leads.sample_material_ids` (destructive; needs the owner's approval).

## What the workshop must provide, and when

| Needed before | What (see `docs/LISTA-ATELIER.md`) |
|---|---|
| PR-3 merges | Confirmation of the configurator sets (models, heights, bases, extras, families) |
| PR-7 preview | The first admin user, created in the Supabase dashboard (Authentication → Users → Add user), and that user's email, so the role can be granted |
| PR-11 starts | `05-catalog.xlsx` (the template is `docs/atelier/05-catalog.xlsx`: all sheets, price category A/B/C per colour) or the same data entered through the admin, photos (FOTO 01–08, projects, swatches, legs, atelier), company data (§1), decisions (§2: prices public, measurements, delivery, response time, deposit), texts from the 30-minute talk (§3), 3–6 reviews with written consent |
| PR-12 starts | A mailbox on `vismob.app` (the launch domain, already bought), lawyer-validated legal texts, Google Business Profile link and manager access, vector logo if any |

## Owner setup checklist (Vercel → Project → Settings → Environment Variables; values never in chat)

| Before | Variables |
|---|---|
| PR-2 | `RESEND_API_KEY` (Resend account, EU region if offered), `NOTIFY_EMAIL` (your address, Preview + Development), `IP_HASH_SALT`, `FORM_HMAC_SECRET` (random, `openssl rand -base64 32`); optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (Cloudflare; the public test pair in Preview) |
| PR-5 | `REVALIDATE_SECRET` |
| PR-10 | `CRON_SECRET` (exactly that name) |
| PR-12 | `NEXT_PUBLIC_SITE_URL` (`https://www.vismob.app`, Production), `EMAIL_FROM`, Production `NOTIFY_EMAIL`, Production Turnstile keys (both, or neither) |

The three Supabase variables come from the Vercel integration. Vercel Pro and Supabase Pro are confirmed.

## Photos (PR-11)

Photos go in through the admin (PR-8, PR-9): the browser resizes them and uploads them to the `media` bucket, and the admin's Server Actions write the rows. Cloud sessions hold no secrets and the Supabase connector cannot upload Storage objects, so the fallback stays: the owner drags prepared photos (2400 px on the long side, WebP or JPEG) into the `media` bucket in Supabase Studio and the session writes the rows by SQL. `scripts/upload-media.ts` is not written (see Decisions, „Photos tooling”): the admin's upload covers every photo on the site.

## Risks

- `react-dom/server` throws in the React Server layer: emails go through externalised `@react-email/*`; the drawing goes through the scene serialiser. Never import `react-dom/server` in an action, route handler or `opengraph-image`.
- `@resvg/resvg-js` is a native addon: externalised, Node runtime, font shipped as base64 (file tracing is unreliable for a static route's action).
- Builds have no env in the session: one reader without the seed fallback breaks `npm run build` for every later PR.
- Previews write to the live database: additive migrations only; test leads are tagged with `source.environment` and purged as spam by the retention job.
- The container cannot reach Turnstile, Google Maps, Resend or Supabase: submission flows are verified on the Vercel preview by the owner.
- The workshop's deliverables are the critical path for PR-11 and PR-12; photos most of all.
