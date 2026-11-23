# Launch checklist

What has to happen between "the code is merged" and "the workshop's site is live on its own domain", `vismob.app` (docs/PLAN.md PR-11 and PR-12, docs/ARHITECTURA.md §11). Each item names who does it:

- **Owner**: the person who holds the Vercel, Supabase, Resend and Cloudflare accounts and runs the cloud sessions. Secret values are typed only on the Vercel project's Environment Variables page (Vercel → the project → Settings → Environment Variables), never in a chat.
- **Workshop**: the client, who provides what docs/LISTA-ATELIER.md asks for and operates `/admin` afterwards.
- **Session**: a Claude Code cloud session, through a pull request or a check it can run from the container.

Order matters: the forms' secrets can go in today (section 0), the content comes first among the rest (the placeholder gate cannot pass before), then the domain and the email, then the checks on production.

## 0. The request forms: secrets missing today

State on 2026-11-23, read from the deployed site (a session cannot list the project's variables, the connector's token is refused): Production has no `FORM_HMAC_SECRET` (the runtime errors of `/contact` say so; two visitors got the form's generic error) and no `CRON_SECRET`; the `leads` table is empty, so no request has ever been stored, in any environment. The forms have therefore never run end to end on a deployment.

- [ ] **Owner** · `FORM_HMAC_SECRET` and `IP_HASH_SALT` (random, 32 bytes each: `openssl rand -base64 32`) in Production and Preview. Without either, a submit ends with „Nu am putut trimite cererea. Încearcă din nou sau sună-ne.” and nothing is saved.
- [ ] **Owner** · `RESEND_API_KEY` in Production and Preview, and `NOTIFY_EMAIL` in Preview (the developer's address). Without the key, a Preview stores the request and logs a dry run (no email leaves, the events are recorded as sent). Production does not: each send fails with "Missing environment variable RESEND_API_KEY", the events are recorded as failed, and the retry job waits, reporting that one error on every run while a failed email of the last seven days exists, until the variable is there; its first run afterwards sends what failed in the last seven days. A missing `EMAIL_FROM` in Production does the same, and the run names that variable. No alert email can be sent in that state: the signal is the failed run under Vercel → Cron Jobs and the log line „GET /api/cron/retry-notifications failed: Missing environment variable …”. A request whose emails failed more than seven days before the variable arrived is not retried; it is still in `/admin` → Cereri. `NOTIFY_DRY_RUN` stays unset in Production: set to 1 it turns every send into a dry run recorded as sent. Without `NOTIFY_EMAIL` the workshop's email is recorded as failed and the client's confirmation still goes out. A failed email of a request made on a preview is not retried: the job runs on Production and leaves requests of other environments alone.
- [ ] **Owner** · A redeploy after adding variables: a deployment keeps the variables it was built with.
- [ ] **Owner** · One test request on the preview from each form (the contact form with a photo, then „Trimite configurația”): it appears in `/admin` › Cereri and both emails arrive, the configurator's one with the PNG drawing. Mark the two as spam afterwards.

## 1. The content (PR-11)

- [ ] **Workshop** · Everything in docs/LISTA-ATELIER.md §1–§9: company data, the decisions of §2, the photos, the catalogue (`05-catalog.xlsx`, from the template `docs/atelier/05-catalog.xlsx`, or the same data typed into the panel), the reviews with their written consents.
- [ ] **Owner** or **Workshop** · The content entered in `/admin`, in this order: **Setări** (every key, `show_prices` as decided, the atelier photo; no required text can be saved empty, a value not known yet keeps its placeholder) → **Catalog** (family texts and specs, every material with photo and price category, the supplier code where there is one, base notes and photos) → **Prețuri** → **Lucrări** (each project saved, then its photos, then consent and `published`; exactly one `hero`, with a photo) → **Recenzii**. The why of the order is in docs/ADMIN.md, "Entering the content".
- [ ] **Session** · If the catalogue arrives as the workbook: `npm run catalog:import -- <file>` and, when it reports no problem, the two migrations it wrote applied through the `db-change` skill; then one save in Catalog and one in Prețuri so the cache tags expire. This goes before any catalogue edit in the panel: the sheet carries the catalogue it was filled from.
- [ ] **Session** · The placeholder gate against the preview of the branch, from a cloud session:

  ```
  PLACEHOLDER_GATE=1 PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app npx playwright test tests/e2e/no-placeholders.spec.ts
  ```

  It opens every public route at 1440 px and 390 px and fails on any `[` in the visible text, the title or the description, and on any visible FOTO box; it opens every closed answer of „Întrebări” and every tab of `/materiale` before it reads. So it passes only with a published hero project that has a photo, the workshop photo in Setări, a photo on every published project and photos on the three base cards. The map box and a colour swatch without a photo are not placeholders. Whatever it lists goes back to the panel (or to the code, for a text that lives there). It skips itself without `PLACEHOLDER_GATE=1`, because the container's seed still carries placeholders. It still sees the configurator with its default colour only, which is safe since a colour without a supplier code prints nothing.

## 2. Legal texts (PR-12)

- [ ] **Workshop** · The three texts validated by a lawyer (docs/LISTA-ATELIER.md §10): the privacy policy (what the two forms collect, which processors see it), the cookie policy and the terms (deposit, payment, delivery, warranty; the explicit note that made-to-measure goods carry no 14-day withdrawal right, OUG 34/2014), plus the final wording of the consent sentence under the forms.
- [ ] **Session** · One pull request that puts the three texts on `/confidentialitate`, `/cookies` and `/termeni` (they are static pages, so this is code) and updates the consent checkbox text; the exact sentence shown is what `leads.consent_text` stores from then on.
- [ ] **Owner** · The data processing agreements of the processors the privacy policy names, accepted in each dashboard: Vercel (hosting, Web Analytics, Speed Insights), Supabase (database, storage), Resend (email), Cloudflare (Turnstile).

## 3. Domain

The launch domain is `vismob.app`. The owner chose it on 2026-11-23, in place of the `.ro` domain the plan first named.

- [x] **Owner** · `vismob.app` bought through Vercel (2026-11-23; registrar and DNS at Vercel) and attached to the project: `www.vismob.app` serves production and the apex redirects to it.
- [ ] **Owner** · Auto-renew switched on for `vismob.app` (Vercel → Domains). It was off on the day of the purchase; the domain expires on 2027-11-23.
- [ ] **Owner** · `NEXT_PUBLIC_SITE_URL` = `https://www.vismob.app` in Production. It is the base of the canonical links, the sitemap, `robots.txt`, the Open Graph image, the JSON-LD `url` and the share links in emails and WhatsApp (`siteUrl()`). Without it the site takes Vercel's own choice of production domain (`VERCEL_PROJECT_PRODUCTION_URL`), which already is `www.vismob.app` (seen in `/robots.txt` on 2026-11-23); the variable pins it. A session cannot set it: the connector's token may not write Production variables.
- [ ] **Session** · After the next production deployment: `/robots.txt` names the sitemap on `www.vismob.app`, `/sitemap.xml` lists the eight routes there, `/configurator` carries `<link rel="canonical">` on it, `/opengraph-image` renders, and Acasă carries one `application/ld+json` script with the workshop's name.
- [ ] **Owner** · `vismob.dev`: turned into a redirect to `www.vismob.app` (Vercel → the project → Settings → Domains → Edit), or removed from the project. Until then both hosts serve the same site; the canonical links already point at `vismob.app`.

## 4. Email (Resend)

- [ ] **Owner** · Resend → Domains: add the sending domain, `vismob.app` or a subdomain such as `mail.vismob.app`, which keeps the main domain's reputation apart (ARHITECTURA §11). Add at the DNS the records Resend shows: SPF (TXT) and DKIM, plus a `_dmarc` TXT record with `v=DMARC1; p=none` to start (monitoring only; tightened later). The DNS is at Vercel (Vercel → Domains → `vismob.app` → DNS Records); the records are public values, so a session may be given them to add. Verify in Resend.
- [ ] **Owner** · `EMAIL_FROM` in Production = `<Nume atelier> <cereri@<the verified domain>>`. The address should exist as a mailbox (docs/LISTA-ATELIER.md §10), so a client's reply does not bounce. Without it Production fails every send, recorded as failed, and the retry job waits as it does for a missing `RESEND_API_KEY`.
- [ ] **Owner** · `NOTIFY_EMAIL` in Production = the workshop's address that receives requests (docs/LISTA-ATELIER.md §2). Preview keeps the developer's address, so test requests never reach the workshop.
- [ ] **Owner** · One test request on the preview after the records verify: both emails arrive from the new address, not in spam, with SPF and DKIM passing in the headers, the configurator's one with the PNG drawing attached.

## 5. Anti-spam (Turnstile)

- [ ] **Owner** · Cloudflare → Turnstile → the widget: `www.vismob.app` and `vismob.app` among its hostnames.
- [ ] **Owner** · `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Production = that widget's real pair. Preview keeps Cloudflare's test pair. Turnstile is on only with both keys (docs/PLAN.md, principle 3). With one of them missing every submit passes unverified and the runtime logs carry "verifyTurnstile: Missing environment variable …" at error level. With the site key alone the widget still shows, so a visible widget proves nothing: send one test request and look for that line in the logs.

## 6. Crons

- [ ] **Owner** · `CRON_SECRET` (random, 32 bytes: `openssl rand -base64 32`), still missing today: the three jobs (`retry-notifications` every 15 min, `purge-pending` daily, `retention` weekly) answer 503 until it is set, so nothing is retried meanwhile and the seven-day window of the failed emails keeps running. Vercel → the project → Settings → Cron Jobs lists the runs after the next deployment.

## 7. Settings and access

- [ ] **Workshop** · The Google Business Profile link and manager access for the owner (docs/LISTA-ATELIER.md §1).
- [ ] **Owner** · `google_profile_url` in `/admin` › Setări (it feeds the JSON-LD `sameAs` only; no page links to the profile); `google_rating` and `google_reviews_count` only if they are to be shown, an empty value hides the line. In the profile itself: the website link set to the new domain.
- [ ] **Owner** · The admin password changed by its holder (Supabase → Authentication → Users → the user), so that no password that passed through a dashboard screen or a message stays in use; sign out and in again. A second admin for the workshop, if it operates the panel itself: docs/ADMIN.md, "Creating the first user".

## 8. Environment variables, in one place

| Variable | Environment | Value | Who |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Production | `https://www.vismob.app` | owner |
| `EMAIL_FROM` | Production | `<Nume atelier> <cereri@<the domain verified in Resend>>`, for example `cereri@vismob.app` | owner |
| `NOTIFY_EMAIL` | Production | the workshop's address (Preview keeps the developer's) | owner |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Production | the real pair of the widget with the new hostnames (Preview keeps the test pair) | owner |
| `CRON_SECRET` | all | random, 32 bytes; missing on 2026-11-23 | owner |
| `FORM_HMAC_SECRET` | all | random, 32 bytes; missing in Production on 2026-11-23 | owner |
| `IP_HASH_SALT` | all | random, 32 bytes | owner |
| `RESEND_API_KEY` | all | the Resend account's key | owner |

The three Supabase variables come from the Vercel integration. `REVALIDATE_SECRET` is optional: nothing calls `/api/revalidate` (docs/PLAN.md, „Revalidation”). Which of the others are set cannot be read from a session, so check every row on the Environment Variables page; section 0 says what the site does without each.

## 9. Checks on production, before announcing

- [ ] **Session** · The placeholder gate against production:

  ```
  PLACEHOLDER_GATE=1 PLAYWRIGHT_BASE_URL=https://www.vismob.app npx playwright test tests/e2e/no-placeholders.spec.ts
  ```

- [ ] **Session** · The full Playwright suite against production (axe at 1440 px and 390 px on every page, the configurator, the material tabs, the mobile menu, the admin redirect, the cron route refusing without the secret):

  ```
  PLAYWRIGHT_BASE_URL=https://www.vismob.app npx playwright test
  ```

  A cloud session reaches the site only if `www.vismob.app` is among its environment's allowed hosts.

  The form specs validate on the client and never submit, so the run creates no request and sends no email.

- [ ] **Owner** · Lighthouse ≥ 95 on mobile for Performance, Accessibility, Best Practices and SEO (ARHITECTURA §10), on `/`, `/configurator`, `/materiale`, `/lucrari` and `/contact`, with PageSpeed Insights or Chrome's Lighthouse panel. LCP under 2.5 s and CLS under 0.05 on Acasă.
- [ ] **Owner** or **Workshop** · A real request from a phone: configure a bed on the production site and send „Trimite configurația”; the workshop's email arrives with the PNG drawing, the client's confirmation arrives, the request appears in `/admin` › Cereri with its code; then the same with „Cerere de ofertă” on `/contact`, with a photo. Afterwards mark the two test requests as spam in the panel, so the weekly `retention` job removes them after 30 days.
- [ ] **Owner** · After the first visits, Vercel → the project → Analytics shows the six events (`config_start`, `config_step`, `quote_submit`, `contact_submit`, `whatsapp_click`, `phone_click`) and Speed Insights shows data.

## After launch

- The `_dmarc` policy tightened from `p=none` to `p=quarantine` once the reports show only the site and the workshop's own mail sending from the domain.
- The deferred items of docs/PLAN.md: `/modele/[model]` pages, the Lucrări lightbox, magic-link sign-in for the panel, the destructive cleanup of the unused `'mostre'` enum value and columns.
