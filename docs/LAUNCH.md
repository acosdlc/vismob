# Launch checklist

What has to happen between "the code is merged" and "the workshop's site is live on its own domain" (docs/PLAN.md PR-11 and PR-12, docs/ARHITECTURA.md §11). Each item names who does it:

- **Owner**: the person who holds the Vercel, Supabase, Resend and Cloudflare accounts and runs the cloud sessions. Secret values are typed only on the Vercel project's Environment Variables page (Vercel → the project → Settings → Environment Variables), never in a chat.
- **Workshop**: the client, who provides what docs/LISTA-ATELIER.md asks for and operates `/admin` afterwards.
- **Session**: a Claude Code cloud session, through a pull request or a check it can run from the container.

Order matters: the forms' secrets can go in today (section 0), the content comes first among the rest (the placeholder gate cannot pass before), then the domain and the email, then the checks on production.

## 0. The request forms: secrets missing today

State on 2026-11-23, read from the deployed site (a session cannot list the project's variables, the connector's token is refused): Production has no `FORM_HMAC_SECRET` (the runtime errors of `/contact` say so; two visitors got the form's generic error) and no `CRON_SECRET`; the `leads` table is empty, so no request has ever been stored, in any environment. The forms have therefore never run end to end on a deployment.

- [ ] **Owner** · `FORM_HMAC_SECRET` and `IP_HASH_SALT` (random, 32 bytes each: `openssl rand -base64 32`) in Production and Preview. Without either, a submit ends with „Nu am putut trimite cererea. Încearcă din nou sau sună-ne.” and nothing is saved.
- [ ] **Owner** · `RESEND_API_KEY` in Production and Preview, and `NOTIFY_EMAIL` in Preview (the developer's address). Without the key a request is stored but no email leaves, silently: the events are recorded as a dry run. Without `NOTIFY_EMAIL` the workshop's email is recorded as failed and the client's confirmation still goes out.
- [ ] **Owner** · A redeploy after adding variables: a deployment keeps the variables it was built with.
- [ ] **Owner** · One test request on the preview from each form (the contact form with a photo, then „Trimite configurația”): it appears in `/admin` › Cereri and both emails arrive, the configurator's one with the PNG drawing. Mark the two as spam afterwards.

## 1. The content (PR-11)

- [ ] **Workshop** · Everything in docs/LISTA-ATELIER.md §1–§9: company data, the decisions of §2, the photos, the catalogue (`05-catalog.xlsx`, from the template `docs/atelier/05-catalog.xlsx`, or the same data typed into the panel), the reviews with their written consents.
- [ ] **Owner** or **Workshop** · The content entered in `/admin`, in this order: **Setări** (every key, `show_prices` as decided, the atelier photo) → **Catalog** (family texts and specs, every material with photo, supplier code and price category, base notes and photos) → **Prețuri** → **Lucrări** (photos, consent, exactly one `hero`) → **Recenzii**. The why of the order is in docs/ADMIN.md, "Entering the content".
- [ ] **Session** · If the catalogue arrives as the workbook: `npm run catalog:import -- <file>` and, when it reports no problem, the two migrations it wrote applied through the `db-change` skill; then one save in Catalog and one in Prețuri so the cache tags expire. This goes before any catalogue edit in the panel: the sheet carries the catalogue it was filled from.
- [ ] **Session** · The placeholder gate against the preview of the branch, from a cloud session:

  ```
  PLACEHOLDER_GATE=1 PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app npx playwright test tests/e2e/no-placeholders.spec.ts
  ```

  It opens every public route at 1440 px and 390 px and fails on any `[` in the visible text, the title or the description. Whatever it lists goes back to the panel (or to the code, for a text that lives there). It skips itself without `PLACEHOLDER_GATE=1`, because the container's seed still carries placeholders.

## 2. Legal texts (PR-12)

- [ ] **Workshop** · The three texts validated by a lawyer (docs/LISTA-ATELIER.md §10): the privacy policy (what the two forms collect, which processors see it), the cookie policy and the terms (deposit, payment, delivery, warranty; the explicit note that made-to-measure goods carry no 14-day withdrawal right, OUG 34/2014), plus the final wording of the consent sentence under the forms.
- [ ] **Session** · One pull request that puts the three texts on `/confidentialitate`, `/cookies` and `/termeni` (they are static pages, so this is code) and updates the consent checkbox text; the exact sentence shown is what `leads.consent_text` stores from then on.
- [ ] **Owner** · The data processing agreements of the processors the privacy policy names, accepted in each dashboard: Vercel (hosting, Web Analytics, Speed Insights), Supabase (database, storage), Resend (email), Cloudflare (Turnstile).

## 3. Domain

- [ ] **Workshop** · The `.ro` domain registered on the workshop's own company (docs/LISTA-ATELIER.md §10), with the owner able to edit its DNS, or its nameservers pointed at Vercel.
- [ ] **Owner** · Vercel → the project → Settings → Domains: add `www.<domeniu>.ro` and `<domeniu>.ro`, the apex redirecting to `www` as `vismob.dev` does today; add the DNS records Vercel shows; wait for the certificate.
- [ ] **Owner** · `NEXT_PUBLIC_SITE_URL` = `https://www.<domeniu>.ro` in Production. It is the base of the canonical links, the sitemap, `robots.txt`, the Open Graph image, the JSON-LD `url` and the share links in emails and WhatsApp (`siteUrl()`).
- [ ] **Session** · After the first production deployment on the new domain: `/robots.txt` names the sitemap on the new host, `/sitemap.xml` lists the eight routes there, `/configurator` carries `<link rel="canonical">` on it, `/opengraph-image` renders, and Acasă carries one `application/ld+json` script with the workshop's name.
- [ ] **Owner** · `vismob.dev`: kept as a redirect to the new domain for a while, or removed from the project.

## 4. Email (Resend)

- [ ] **Owner** · Resend → Domains: add the sending domain. A subdomain such as `mail.<domeniu>.ro` keeps the main domain's reputation apart (ARHITECTURA §11). Add at the DNS the records Resend shows: SPF (TXT) and DKIM, plus a `_dmarc` TXT record with `v=DMARC1; p=none` to start (monitoring only; tightened later). Verify in Resend.
- [ ] **Owner** · `EMAIL_FROM` in Production = `<Nume atelier> <cereri@<the verified domain>>`. The address should exist as a mailbox (docs/LISTA-ATELIER.md §10), so a client's reply does not bounce.
- [ ] **Owner** · `NOTIFY_EMAIL` in Production = the workshop's address that receives requests (docs/LISTA-ATELIER.md §2). Preview keeps the developer's address, so test requests never reach the workshop.
- [ ] **Owner** · One test request on the preview after the records verify: both emails arrive from the new address, not in spam, with SPF and DKIM passing in the headers, the configurator's one with the PNG drawing attached.

## 5. Anti-spam (Turnstile)

- [ ] **Owner** · Cloudflare → Turnstile → the widget: `www.<domeniu>.ro` and `<domeniu>.ro` among its hostnames.
- [ ] **Owner** · `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Production = that widget's real pair. Preview keeps Cloudflare's test pair. Without a site key the widget is simply off (docs/PLAN.md, principle 3), so check that the widget shows under both forms on production.

## 6. Crons

- [ ] **Owner** · `CRON_SECRET` (random, 32 bytes: `openssl rand -base64 32`), still missing today: the three jobs (`retry-notifications` every 15 min, `purge-pending` daily, `retention` weekly) answer 503 until it is set. Vercel → the project → Settings → Cron Jobs lists the runs after the next deployment.

## 7. Settings and access

- [ ] **Workshop** · The Google Business Profile link and manager access for the owner (docs/LISTA-ATELIER.md §1).
- [ ] **Owner** · `google_profile_url` in `/admin` › Setări (it feeds the JSON-LD `sameAs` only; no page links to the profile); `google_rating` and `google_reviews_count` only if they are to be shown, an empty value hides the line. In the profile itself: the website link set to the new domain.
- [ ] **Owner** · The admin password changed by its holder (Supabase → Authentication → Users → the user), so that no password that passed through a dashboard screen or a message stays in use; sign out and in again. A second admin for the workshop, if it operates the panel itself: docs/ADMIN.md, "Creating the first user".

## 8. Environment variables, in one place

| Variable | Environment | Value | Who |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Production | `https://www.<domeniu>.ro` | owner |
| `EMAIL_FROM` | Production | `<Nume atelier> <cereri@<domeniu verified in Resend>>` | owner |
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
  PLACEHOLDER_GATE=1 PLAYWRIGHT_BASE_URL=https://www.<domeniu>.ro npx playwright test tests/e2e/no-placeholders.spec.ts
  ```

- [ ] **Session** · The full Playwright suite against production (axe at 1440 px and 390 px on every page, the configurator, the material tabs, the mobile menu, the admin redirect, the cron route refusing without the secret):

  ```
  PLAYWRIGHT_BASE_URL=https://www.<domeniu>.ro npx playwright test
  ```

  The form specs validate on the client and never submit, so the run creates no request and sends no email.

- [ ] **Owner** · Lighthouse ≥ 95 on mobile for Performance, Accessibility, Best Practices and SEO (ARHITECTURA §10), on `/`, `/configurator`, `/materiale`, `/lucrari` and `/contact`, with PageSpeed Insights or Chrome's Lighthouse panel. LCP under 2.5 s and CLS under 0.05 on Acasă.
- [ ] **Owner** or **Workshop** · A real request from a phone: configure a bed on the production site and send „Trimite configurația”; the workshop's email arrives with the PNG drawing, the client's confirmation arrives, the request appears in `/admin` › Cereri with its code; then the same with „Cerere de ofertă” on `/contact`, with a photo. Afterwards mark the two test requests as spam in the panel, so the weekly `retention` job removes them after 30 days.
- [ ] **Owner** · After the first visits, Vercel → the project → Analytics shows the six events (`config_start`, `config_step`, `quote_submit`, `contact_submit`, `whatsapp_click`, `phone_click`) and Speed Insights shows data.

## After launch

- The `_dmarc` policy tightened from `p=none` to `p=quarantine` once the reports show only the site and the workshop's own mail sending from the domain.
- The deferred items of docs/PLAN.md: `/modele/[model]` pages, the Lucrări lightbox, magic-link sign-in for the panel, the destructive cleanup of the unused `'mostre'` enum value and columns.
