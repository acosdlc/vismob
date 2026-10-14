# ARHITECTURA.md — Site atelier de paturi la comandă

> Arhitectura tehnică pentru construcția cu Claude Code, pe stack-ul: **GitHub · Vercel · Next.js · Supabase · Resend**.
>
> **Notificările sunt doar pe email (Resend). Nu folosim Twilio și nu trimitem SMS-uri.** Emailul clientului e obligatoriu în toate formularele. Diferențele față de starter-ul proiectului (npm, `src/`, o singură bază de date) sunt în `docs/ARHITECTURA-NOTE.md`.
> Designul complet e în `docs/DESIGN.md`. Regulile de lucru pentru Claude Code sunt în `CLAUDE.md`.

---

## 0. Pe scurt

- **Next.js 16 (App Router)** pe **Vercel Pro**, cu codul pe **GitHub**: fiecare PR are un preview, iar `main` merge în producție.
- **Paginile sunt statice și se regenerează la editarea conținutului.** Catalogul, lucrările, recenziile și setările se citesc din **Supabase** la build/revalidare, deci site-ul e rapid și bun pentru SEO.
- **Trei formulare** (cerere de ofertă, configurator, mostre) scriu prin **Server Actions** în Supabase. După răspuns, `after()` trimite emailurile prin **Resend** (către atelier și către client). Cererea e salvată înainte de orice notificare, așa că nu se pierde dacă un serviciu cade.
- **Pozele clienților** urcă direct din browser în Supabase Storage (bucket privat), cu URL-uri semnate, ocolind limita de body a funcțiilor.
- **Desenul configurației** se generează și ca PNG pe server și pleacă atașat în emailul către atelier.
- **v1 nu are panou de admin**: atelierul primește un email la fiecare cerere, iar tu editezi catalogul în Supabase Studio. **v2** adaugă `/admin` pentru atelier (cereri, catalog, prețuri, lucrări).

```
                    ┌──────────────── Vercel (Next.js 16, regiunea fra1) ────────────────┐
Vizitator ────────► │ pagini statice + 'use cache' ◄── citiri ── Supabase Postgres (eu-central-1)
                    │ Configurator / Materiale (client components)        catalog, lucrări, setări  │
                    │ Server Actions ── validare, Turnstile, rate limit ──► leads, lead_files      │
                    │      └─ after(): Resend (email atelier + client)                              │
                    │ upload semnat ─────────────────────────────────► Storage: lead-uploads (privat)
                    │ /admin (v2) ── Supabase Auth, rol admin                Storage: media (public)│
                    │ Vercel Cron: retrimite notificări eșuate, curăță upload-uri, retenție GDPR    │
                    └────────────────────────────────────────────────────────────────────────────┘
GitHub (PR → Preview, main → Production) · migrații Supabase în repo (supabase/migrations)
```

---

## 1. Decizii tehnice

| Strat | Alegere | De ce |
|---|---|---|
| Framework | **Next.js 16.x**, App Router, TypeScript strict, Server Components implicit | SEO, pagini statice, Server Actions, `after()`. Next 16.3 generează la `next dev` un `AGENTS.md` cu documentația versiunii instalate, pe care Claude Code o citește direct. |
| Cache | `cacheComponents: true`, funcțiile de citire cu `'use cache'` + `cacheTag()`, invalidare pe tag la editare | conținut static, regenerat doar când se schimbă ceva |
| Stil | **Tailwind CSS v4** cu tokenii din DESIGN.md §2.7 | un singur sistem, fără CSS răzleț |
| UI | componente proprii, fără bibliotecă de UI | designul e custom și are puține componente |
| Formulare | Server Actions + `useActionState` + **zod** | merg și fără JS, validare comună client/server |
| Telefon | `libphonenumber-js`, normalizat E.164, implicit RO | numere curate pentru apel și WhatsApp |
| Bază de date | **Supabase Postgres**, RLS pe toate tabelele | o singură sursă de adevăr, admin ușor în v2 |
| Fișiere | Supabase Storage: `media` (public, pozele site-ului) și `lead-uploads` (privat) | pozele clienților nu sunt niciodată publice |
| Imagini | `next/image` (optimizare Vercel) | AVIF/WebP, dimensiuni corecte, fără layout shift |
| Email | **Resend** + React Email | template-uri în React, domeniu verificat, reply-to |
| Anti-spam | **Cloudflare Turnstile** + honeypot + timp minim + rate limit în Postgres | gratuit, invizibil, fără cookies de tracking |
| PNG desen | `react-dom/server` → SVG → `@resvg/resvg-js` (runtime Node) | aceeași componentă ca în UI, atașată în email |
| Analytics | Vercel Web Analytics + Speed Insights | fără cookies, deci fără banner. Evenimentele custom cer planul Pro. |
| Hartă | embed Google Maps încărcat abia la click | fără cookies Google până la acțiunea vizitatorului |
| Teste | Vitest (logică), Playwright + axe (fluxuri, accesibilitate) | |
| Pachete | pnpm | |

---

## 2. Conturi și costuri lunare

| Serviciu | Plan | Cost | De ce acest plan |
|---|---|---|---|
| Vercel | **Pro** | $20 / lună (include $20 credit de utilizare; fiecare developer în plus, +$20) | Hobby e „restricted to non-commercial personal use only”, iar un site care promovează vânzarea unui serviciu e uz comercial. Dacă ai deja o echipă Pro, proiectul intră acolo fără cost în plus. |
| Supabase | **Pro** (producție) | de la $25 / lună | Pe Free, proiectul e pus pe pauză după o săptămână fără activitate (un site cu puține cereri chiar poate ajunge acolo) și nu are backup. Pro: 8 GB disk, 100 GB storage, backup zilnic păstrat 7 zile, fără pauză. Într-o organizație Pro existentă plătești doar compute-ul proiectului nou. |
| Supabase | Free (staging) | $0 | pentru deploy-urile de preview; pauza nu contează acolo |
| Resend | **Free** | $0 | 3.000 de emailuri pe lună, maximum 100 pe zi. Ajunge cu mult. Pro costă $20/lună pentru 50.000. |
| Cloudflare Turnstile | Free | $0 | |
| Domeniu .ro | la registrar | anual | pe firma atelierului |

**Total: aproximativ $45–55 pe lună**, sau mai puțin dacă Vercel și Supabase intră în echipe Pro pe care le ai deja.

**Cine deține conturile:** domeniul și profilul Google trebuie să fie pe firma atelierului. Vercel și Supabase pot sta la tine la început; ambele permit transferul proiectului mai târziu.

---

## 3. Structura repo-ului

```
atelier-paturi/
├─ CLAUDE.md                       # reguli pentru Claude Code (citit automat)
├─ docs/  DESIGN.md  ARHITECTURA.md
├─ app/
│  ├─ layout.tsx                   # fonturi (next/font), Header, Footer, Analytics
│  ├─ globals.css                  # Tailwind v4 + @theme (DESIGN §2.7)
│  ├─ page.tsx                     # Acasă
│  ├─ configurator/page.tsx        # server: citește catalogul (+ prețurile) → <Configurator/>
│  ├─ materiale/page.tsx
│  ├─ lucrari/page.tsx
│  ├─ contact/page.tsx
│  ├─ (legal)/confidentialitate/page.tsx · cookies/page.tsx · termeni/page.tsx
│  ├─ admin/…                      # v2
│  ├─ api/revalidate/route.ts      # webhook Supabase → invalidează tag-uri
│  ├─ api/cron/[job]/route.ts      # joburi Vercel Cron (protejate cu CRON_SECRET)
│  ├─ sitemap.ts · robots.ts · opengraph-image.tsx · not-found.tsx
├─ components/
│  ├─ site/        Header, MobileMenu, Footer, Button, Eyebrow, SectionHeader, Photo,
│  │               DimensionLine, Ticket, SpecList, Field, Checkbox, FileUpload, Turnstile
│  ├─ home/        Hero, Facts, Process, Models, MaterialsTeaser, ConfiguratorBand,
│  │               Gallery, Atelier, Reviews, Faq, ContactSection
│  ├─ drawings/    BedDrawing (SVG la scară), BedLineArt (carduri de model), patterns
│  ├─ configurator/ Configurator (client), steps/*, TicketPanel, QuoteForm, MobileBar
│  └─ materials/   MaterialsBrowser (client), SwatchTile, SampleBox
├─ lib/
│  ├─ configurator/ types · catalog.seed · rules · geometry · format · pricing · url  (DESIGN §5)
│  ├─ data/        catalog.ts, settings.ts, projects.ts, reviews.ts   # 'use cache' + cacheTag
│  ├─ supabase/    server.ts (cheia secretă, 'server-only'), browser.ts, database.types.ts
│  ├─ notify/      email.ts (Resend), drawing-png.ts (resvg), dispatch.ts
│  ├─ security/    turnstile.ts, rate-limit.ts, ip.ts
│  └─ validation/  schemas.ts (zod, comune client/server)
├─ actions/        submit-quote.ts, submit-contact.ts, submit-samples.ts, create-upload-urls.ts
├─ emails/         LeadToWorkshop.tsx, LeadConfirmation.tsx, SamplesToWorkshop.tsx, SamplesConfirmation.tsx
├─ supabase/       config.toml · migrations/0001_init.sql · seed.sql
├─ scripts/        import-catalog.ts (Excel atelier → Supabase), upload-media.ts (sharp → bucketul media)
├─ assets/fonts/   DMMono-Regular.ttf (pentru textul din PNG-ul generat de resvg)
├─ tests/          unit/*.test.ts · e2e/*.spec.ts
├─ vercel.json     # regiunea fra1, cron-uri
└─ .env.example
```

---

## 4. Rute

| Rută | Randare | Date | Note |
|---|---|---|---|
| `/` | statică | catalog (modele, mostre featured), lucrări featured, recenzii, setări | tag-uri `catalog`, `projects`, `reviews`, `settings` |
| `/configurator` | shell static + client component | catalogul și, dacă `show_prices`, grila de prețuri, ca props | starea în query string (DESIGN §5.3), `useSearchParams` în `<Suspense>` |
| `/materiale` | statică + client component pentru cutia de mostre | familii, materiale, setări | cutia în `localStorage` |
| `/lucrari` | statică | lucrări publicate + poze | filtrul pe model în `?model=` |
| `/contact`, pagini legale | statice | setări | |
| `/admin/*` | dinamică, autentificată | tot | v2 |
| `POST /api/revalidate` | route handler | — | header `x-revalidate-secret`, body `{ tags: [...] }` |
| `GET /api/cron/:job` | route handler | — | `Authorization: Bearer ${CRON_SECRET}` |

**Server Actions:** `submitQuote`, `submitContact`, `submitSamples`, `createUploadUrls`.

---

## 5. Modelul de date (Supabase)

Migrația inițială, `supabase/migrations/0001_init.sql`:

```sql
-- ───────────── Catalog ─────────────
create table public.models (
  id text primary key,                         -- 'capitonat'
  name text not null,
  note text not null,                          -- „Tapițat, cu nasturi”
  description text,                            -- textul de pe cardul de model
  code text not null unique,                   -- 'CAP' (apare în codul configurației)
  sort int not null default 0,
  active boolean not null default true
);

create table public.material_families (
  id text primary key,                         -- 'catifea'
  name text not null,
  code text not null unique,                   -- 'CT'
  tab text not null default 'textile' check (tab in ('textile', 'lemn')),
  description text,
  specs jsonb not null default '[]'::jsonb,    -- [{ "k": "Frecare", "v": "40.000 cicluri Martindale" }]
  sort int not null default 0
);

create table public.materials (
  id text primary key,                         -- 'ct-verde'
  family_id text not null references public.material_families(id),
  name text not null,                          -- 'Verde sticlă'
  code text not null unique,                   -- 'CT01': stabil, nu se refolosește
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  supplier text,
  supplier_code text,
  price_category text not null default 'A' check (price_category in ('A', 'B', 'C')),
  photo_path text,                             -- în bucketul media
  macro_path text,
  featured boolean not null default false,     -- apare pe Acasă
  active boolean not null default true,
  sort int not null default 0
);

create table public.model_families (           -- ce familii merg pe ce model
  model_id text references public.models(id) on delete cascade,
  family_id text references public.material_families(id) on delete cascade,
  primary key (model_id, family_id)
);

create table public.bases (
  id text primary key,                         -- 'lemn' | 'metal' | 'lada' | 'sertare'
  name text not null, note text not null, code text not null unique,
  sort int not null default 0, active boolean not null default true
);

-- Prețurile stau separat și NU sunt citibile public: le citește doar serverul.
create table public.pricing (
  id int primary key default 1 check (id = 1),
  data jsonb not null,                         -- vezi tipul Pricing din §7
  updated_at timestamptz not null default now()
);

-- ───────────── Conținut ─────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  model_id text references public.models(id),
  width_cm int, length_cm int,
  material_id text references public.materials(id),
  base_id text references public.bases(id),
  extras text[] not null default '{}',
  city text,
  delivered_on date,
  config jsonb,                                -- pentru „Vreau unul asemănător” → configurator
  featured boolean not null default false,
  hero boolean not null default false,         -- proiectul din hero (FOTO 01 + fișă)
  published boolean not null default false,
  client_consent boolean not null default false,
  sort int not null default 0
);

create table public.project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null, alt text not null,
  width int, height int, sort int not null default 0
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  first_name text not null, city text, body text not null,
  model_label text,                            -- „Capitonat · 160 × 200”
  source text,                                 -- google / facebook / whatsapp
  consent boolean not null default false,
  published boolean not null default false,
  sort int not null default 0
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null                          -- vezi lista de chei mai jos
);

-- ───────────── Cereri ─────────────
create type public.lead_kind as enum ('contact', 'configurator', 'mostre');
create type public.lead_status as enum ('nou', 'contactat', 'ofertat', 'castigat', 'pierdut', 'spam');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind public.lead_kind not null,
  status public.lead_status not null default 'nou',
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (char_length(phone) between 8 and 20),   -- E.164
  email text not null check (char_length(email) <= 254),                 -- obligatoriu: notificările sunt doar pe email
  city text check (city is null or char_length(city) <= 120),
  address text check (address is null or char_length(address) <= 500),  -- doar la mostre
  message text check (message is null or char_length(message) <= 4000),
  mattress_size text,                          -- formularul de contact
  wants_measurement boolean not null default false,
  config jsonb,                                -- configurația normalizată de server
  config_code text,                            -- CAP-160x200-CT01-H120-LD
  price_estimate_ron int,
  sample_material_ids text[],
  consent_text text not null,                  -- textul exact pe care l-a bifat
  consent_at timestamptz not null default now(),
  source jsonb,                                -- pagina, utm_*, referrer
  ip_hash text,                                -- sha256(ip + salt), pentru rate limit
  notes text
);
create index leads_created_at_idx on public.leads (created_at desc);
create index leads_status_idx on public.leads (status);
create index leads_ip_recent_idx on public.leads (ip_hash, created_at desc);

create table public.lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  path text not null, mime text not null, size_bytes int not null
);

create table public.lead_events (              -- jurnal de notificări (și pentru retry)
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  at timestamptz not null default now(),
  type text not null,                          -- email_workshop | email_client
  ok boolean not null,
  detail jsonb
);

-- ───────────── RLS ─────────────
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

do $$
declare t text;
begin
  foreach t in array array['models','material_families','materials','model_families','bases','pricing',
                           'projects','project_photos','reviews','settings','leads','lead_files','lead_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Citire publică doar pentru conținutul activ sau publicat. pricing, leads, lead_files
-- și lead_events nu au nicio politică publică: le atinge doar serverul, cu cheia secretă.
create policy "public_read" on public.models            for select to anon, authenticated using (active);
create policy "public_read" on public.material_families for select to anon, authenticated using (true);
create policy "public_read" on public.materials         for select to anon, authenticated using (active);
create policy "public_read" on public.model_families    for select to anon, authenticated using (true);
create policy "public_read" on public.bases             for select to anon, authenticated using (active);
create policy "public_read" on public.settings          for select to anon, authenticated using (true);
create policy "public_read" on public.reviews           for select to anon, authenticated using (published and consent);
create policy "public_read" on public.projects          for select to anon, authenticated using (published and client_consent);
create policy "public_read" on public.project_photos    for select to anon, authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and p.published and p.client_consent));

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-uploads', 'lead-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admin_all_storage" on storage.objects for all to authenticated
  using (bucket_id in ('media', 'lead-uploads') and public.is_admin())
  with check (bucket_id in ('media', 'lead-uploads') and public.is_admin());
-- Încărcarea în lead-uploads se face doar cu URL-uri semnate generate de server (createSignedUploadUrl).
-- Citirea se face doar cu URL-uri semnate (createSignedUrl), tot de pe server.
```

**Cheile din `settings.data`** (toate placeholderele din DESIGN §8):
`workshop_name, legal_name, cui, reg_com, registered_office, address, city, phone_public, whatsapp_number, email_public, hours, visits_note, response_time, lead_time, warranty_structure_years, warranty_upholstery_years, delivery_zone, delivery_note, measurement_note, offer_days, deposit_pct, custom_size_range, sells_mattresses, sample_limit, samples_free, samples_delivery, google_rating, google_reviews_count, google_profile_url, instagram_url, facebook_url, show_prices, notify_email, structure_text, slats_text, foam_text, fabrics_text, founded_year, team_size, story_text`.

`notify_email` poate sta și în variabila de mediu `NOTIFY_EMAIL` (§11). Când ambele surse sunt setate, câștigă variabilele de mediu: în Preview trimiți așa doar către tine.

---

## 6. Fluxurile

### 6.1 Cererea din configurator (`submitQuote`)

1. **Clientul alege opțiunile.** Starea stă în URL (DESIGN §5.3). Desenul, codul și prețul orientativ se calculează local, cu `lib/configurator`.
2. **Pozele (opțional).** `FileUpload` comprimă imaginile în browser (latura maximă 2000px, JPEG ~0,8, cu `browser-image-compression`), cere de la Server Action-ul `createUploadUrls` câte un URL semnat pentru `lead-uploads/pending/<uuid>/<n>.jpg` și urcă direct în Storage (`uploadToSignedUrl`). Limite: 6 fișiere de maximum 10 MB și maximum 20 de URL-uri pe IP pe oră. `accept="image/jpeg,image/png,image/webp"`, ca iPhone-ul să convertească de regulă HEIC în JPEG.
3. **Trimiterea**, în Server Action-ul `submitQuote(formData)`, în ordinea:
   1. **Honeypot**: câmpul ascuns `company` trebuie să fie gol. **Timp minim**: au trecut cel puțin 3 secunde de la încărcarea formularului (timestamp semnat HMAC).
   2. **Turnstile**: verifică tokenul la `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
   3. **Validarea zod** (tabelul de mai jos). Telefonul se normalizează la E.164 (`libphonenumber-js`, implicit `RO`), apoi se re-validează.
   4. **Rate limit**: maximum 5 cereri pe `ip_hash` în ultima oră (`select count(*) from leads where ip_hash = $1 and created_at > now() - interval '1 hour'`). IP-ul vine din `x-forwarded-for` (Vercel); `ip_hash = sha256(ip + IP_HASH_SALT)`.
   5. **Recalcularea pe server**: `resolve()` pe catalogul din DB, apoi `configCode()` și `estimatePrice()`. Nu se folosește nimic calculat de client.
   6. **Salvarea**: `insert` în `leads`. Pozele se mută din `pending/` în `<lead_id>/` (`storage.move`), după ce se verifică faptul că prefixul e `pending/` și că fișierul există, apoi `insert` în `lead_files`.
   7. **Răspunsul** `{ ok: true, code }`, cu ecranul de confirmare.
   8. **`after()`** rulează `dispatchLeadNotifications(leadId)`: emailul către atelier și emailul de confirmare către client. Fiecare rezultat se scrie în `lead_events`.
4. **Dacă o notificare eșuează**, cererea rămâne în DB. Cron-ul `retry-notifications` (la fiecare 15 minute) reîncearcă evenimentele cu `ok = false`, de maximum 3 ori, apoi trimite un email de alertă către tine.

| Câmp | Regulă |
|---|---|
| `name` | text 2–120, trim |
| `phone` | număr valid → E.164 |
| `email` | **obligatoriu**, email valid, ≤ 254 |
| `city` | opțional, ≤ 120 |
| `message` | opțional, ≤ 4000 |
| `wantsMeasurement` | boolean |
| `privacy` | obligatoriu bifat (vezi §9 despre temeiul legal) |
| `config` | query string ≤ 2000, parsat cu `configFromParams` |
| `uploads` | ≤ 6 căi, toate cu prefixul `pending/` |
| `turnstileToken`, `startedAt`, `company` | anti-spam |

### 6.2 Cererea de contact (`submitContact`)

La fel ca 6.1, fără configurație. Are în plus `mattress_size` (selectul) și pozele opționale.

### 6.3 Cererea de mostre (`submitSamples`)

`sample_material_ids` (1 … `settings.sample_limit`, toate `active`), plus nume, telefon, email și adresa de livrare (toate obligatorii). Emailul către atelier conține lista de coduri (CT01, BC02…) cu numele furnizorului, gata de pus în plic.

### 6.4 Textele notificărilor

Nu se trimit SMS-uri. Toate notificările sunt emailuri.

**Emailuri** (Resend + React Email, cu stilul site-ului: hârtie, cerneală, mono pentru fișă). Expeditorul e `[Nume atelier] <cereri@domeniu.ro>`.

| Email | Către | Subiect | Conținut |
|---|---|---|---|
| LeadToWorkshop | `NOTIFY_EMAIL`, reply-to = clientul | `Cerere nouă · {cod} · {Nume}, {Oraș}` | fișa (rândurile din DESIGN §5.6), prețul estimat, contactul (link `tel:` și buton WhatsApp spre client), mesajul, măsurători da/nu, linkul „Deschide configurația” (URL-ul de share), pozele (linkuri semnate, valabile 7 zile) și **PNG-ul desenului atașat** |
| LeadConfirmation | clientul, reply-to = emailul atelierului | `Am primit cererea ta · {cod}` | mulțumirea, cei 3 pași care urmează, fișa, PNG-ul desenului, linkul configurației, contactul atelierului |
| SamplesToWorkshop | atelierul | `Mostre de trimis · {n} buc. · {Nume}, {Oraș}` | lista de coduri, adresa, telefonul |
| SamplesConfirmation | clientul | `Pregătim mostrele tale` | lista de mostre, termenul de livrare |

**PNG-ul desenului:** `renderToStaticMarkup(<BedDrawing resolved={r} mode="export" />)` produce un SVG; în modul export, cotele sunt `<text>` SVG, nu HTML. `@resvg/resvg-js` îl randează la 1600px lățime, cu `fontFiles: ['assets/fonts/DMMono-Regular.ttf']`, pe runtime-ul Node (nu Edge).

### 6.5 Actualizarea conținutului

- **v1**: editezi în Supabase Studio. Un **Database Webhook** pe tabelele de conținut face `POST /api/revalidate` cu header-ul secret și tag-ul tabelei (`catalog`, `projects`, `reviews`, `settings`), iar paginile se regenerează în câteva secunde.
- **v2**: fiecare salvare din `/admin` invalidează tag-ul direct, din Server Action.
- Pozele noi (lucrări, mostre) se pregătesc cu `scripts/upload-media.ts`: `sharp` le redimensionează la 2400px, le convertește în WebP/JPEG, le urcă în bucketul `media`, iar `width`/`height` se scriu în DB pentru `next/image`.

---

## 7. Logica partajată a configuratorului

Modulul `lib/configurator` din DESIGN §5 (`types`, `catalog.seed`, `rules`, `geometry`, `format`) plus:

```ts
// lib/configurator/pricing.ts
import type { BaseId, HeadboardHeight, ModelId } from './types';
import type { Resolved } from './rules';

export type PriceCategory = 'A' | 'B' | 'C';

export interface Pricing {
  grid: Record<ModelId, Record<string, number>>; // lei, pe lățime standard: { "90": …, "160": … }
  categoryPct: Record<PriceCategory, number>;     // adaos % pe categoria materialului
  hbPct: Record<`${HeadboardHeight}`, number>;    // adaos % pe înălțimea tăbliei
  base: Record<BaseId, number>;                    // lei
  extras: { led: number; nightstands: number };    // lei
  customPct: number;                               // adaos % pentru dimensiune nestandard
  roundTo: number;                                 // 50
}

/** Prețul orientativ. Rulează și în browser (dacă show_prices), și pe server (care e sursa de adevăr). */
export function estimatePrice(r: Resolved, p: Pricing, category: PriceCategory): number | null {
  const row = p.grid[r.model.id];
  const widths = row ? Object.keys(row).map(Number).sort((a, b) => a - b) : [];
  if (!widths.length) return null;
  const w = widths.find(x => x >= r.w) ?? widths[widths.length - 1]; // urcă la lățimea standard următoare
  const pct = p.categoryPct[category] + p.hbPct[`${r.cfg.hb}`] + (r.cfg.size === 'custom' ? p.customPct : 0);
  const total = row[String(w)] * (1 + pct / 100) + p.base[r.base.id]
    + (r.cfg.led ? p.extras.led : 0) + (r.cfg.nightstands ? p.extras.nightstands : 0);
  return Math.round(total / p.roundTo) * p.roundTo;
}
```

```ts
// lib/configurator/url.ts
import type { Config } from './types';
import { DEFAULT_CONFIG } from './catalog.seed';

/** Citește configurația din query string. Valorile invalide le repară resolve(). */
export function configFromParams(sp: URLSearchParams): Config {
  const num = (k: string, d: number) => { const v = Number(sp.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
  return {
    model: (sp.get('m') ?? DEFAULT_CONFIG.model) as Config['model'],
    size: (sp.get('s') ?? DEFAULT_CONFIG.size) as Config['size'],
    customW: num('w', DEFAULT_CONFIG.customW),
    customL: num('l', DEFAULT_CONFIG.customL),
    family: (sp.get('f') ?? DEFAULT_CONFIG.family) as Config['family'],
    color: sp.get('c') ?? DEFAULT_CONFIG.color,
    hb: num('h', DEFAULT_CONFIG.hb) as Config['hb'],
    base: (sp.get('b') ?? DEFAULT_CONFIG.base) as Config['base'],
    led: sp.get('led') === '1',
    nightstands: sp.get('n') === '1',
  };
}

export function paramsFromConfig(c: Config): URLSearchParams {
  const sp = new URLSearchParams({ m: c.model, s: c.size, f: c.family, c: c.color, h: String(c.hb), b: c.base });
  if (c.size === 'custom') { sp.set('w', String(c.customW)); sp.set('l', String(c.customL)); }
  if (c.led) sp.set('led', '1');
  if (c.nightstands) sp.set('n', '1');
  return sp;
}
```

- În producție, `Color` primește `priceCategory` din `materials.price_category`.
- Pagina `/configurator` (server) citește catalogul și, numai dacă `show_prices`, obiectul `pricing`, apoi le dă componentei client ca props. Altfel grila de prețuri nu ajunge deloc în browser.
- `lib/data/catalog.ts` transformă rândurile din DB în tipul `Catalog` (`model_families` → `Model.families`).

---

## 8. Panoul de admin (v2)

- **Autentificare**: Supabase Auth cu magic link pe email. Accesul îl au doar utilizatorii cu `app_metadata.role = 'admin'` (setat din dashboard sau SQL). Sesiunea se verifică **în layout-ul server `/admin`**, plus RLS pe date; nu te baza doar pe un proxy/middleware.
- **Ecranele**:
  - **Cereri**: listă cu filtre (tip, status, perioadă) și detaliul cererii (fișa, desenul, pozele prin linkuri semnate, butoane Sună / WhatsApp, schimbarea statusului, note). Export CSV.
  - **Catalog**: modele, familii, materiale (CRUD + upload poză + `featured`/`active`), baze, regulile model ↔ familie.
  - **Prețuri**: formular peste `pricing.data`, cu o previzualizare a prețului pentru 3 configurații-tip.
  - **Lucrări**: CRUD, upload de poze, bifa de acord al clientului, `featured`/`hero`.
  - **Recenzii** și **Setări**.
- Fiecare salvare invalidează tag-ul paginilor afectate.

---

## 9. Securitate, anti-spam, GDPR

**Secrete și acces**
- `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `REVALIDATE_SECRET`, `CRON_SECRET` și `IP_HASH_SALT` se folosesc doar în module cu `import 'server-only'`. În browser ajung doar URL-ul Supabase și cheia publishable.
- Folosește cheile noi Supabase: publishable (`sb_publishable_…`) și secret (`sb_secret_…`).
- RLS e activ pe toate tabelele (§5). `leads`, `lead_files`, `lead_events` și `pricing` nu au acces public.

**Anti-spam**: Turnstile, honeypot, timp minim, rate limit pe IP, limite de lungime (zod + `check` în DB), limite de mărime și tip la upload (bucket), căi de upload verificate pe server.

**Header-e** (în `next.config.ts` → `headers()`):
- CSP fără nonce (paginile sunt statice): `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://www.google.com; img-src 'self' data: blob: https://<proiect>.supabase.co; connect-src 'self' https://<proiect>.supabase.co https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Content-Type-Options: nosniff`

**GDPR** (de validat cu un jurist)
- **Temeiul legal** pentru a răspunde la o cerere de ofertă e art. 6(1)(b) (demersuri făcute la cererea persoanei înainte de un contract), nu consimțământul. Bifa din design poate deveni o simplă informare („Folosim datele doar ca să-ți răspundem. Detalii în Politica de confidențialitate.”). O bifă separată, neobligatorie, e necesară doar pentru marketing. În `consent_text` se salvează versiunea textului afișat.
- **Locația datelor**: Supabase în Frankfurt (`eu-central-1`), funcțiile Vercel în `fra1`, Resend pe regiunea UE dacă e disponibilă pe cont. Pentru Vercel, Supabase, Resend și Cloudflare: semnezi DPA-urile (acordurile de prelucrare a datelor) și îi treci ca persoane împuternicite în politica de confidențialitate.
- **Retenția** (propunere, decide atelierul), aplicată de cron-ul `retention`: cererile fără comandă se șterg după 24 de luni, pozele din cereri după 12 luni, adresele de la mostre după 6 luni, spam-ul după 30 de zile, iar `pending/` după 24 de ore.
- **Cookies**: Vercel Analytics nu pune cookies, Turnstile e strict necesar, iar harta se încarcă doar la click. Deci **nu trebuie banner** în v1, dar trebuie politica de cookies. Dacă se adaugă Meta Pixel sau Google Ads, e nevoie de banner cu consimțământ.
- **Datele firmei** apar în footer: denumire, CUI, Registrul Comerțului, sediu.

---

## 10. SEO, performanță, analytics

- **Metadata** pe fiecare pagină (titlu și descriere în română), canonical, `opengraph-image.tsx` (desenul capitonat pe hârtie și numele atelierului), `sitemap.ts` (inclusiv lucrările), `robots.ts`.
- **JSON-LD** pe Acasă: `FurnitureStore`, cu nume, adresă, `geo`, telefon, `openingHoursSpecification`, `areaServed`, `sameAs` (Instagram, Facebook, profilul Google).
- **Google Business Profile** e pârghia principală pentru căutările locale: link spre site, poze, recenzii, categoria potrivită.
- **După lansare**: pagini pe model (`/modele/capitonat` …) pentru căutări ca „pat tapițat la comandă”, „pat capitonat”, „pat cu ladă de depozitare la comandă” + oraș.
- **Alt text** generat din fișa proiectului: „Pat capitonat 160 × 200 din catifea verde, cu ladă de depozitare, livrat în Cluj”.
- **Performanță**: `next/image` cu `priority` doar pe FOTO 01, fonturi prin `next/font` (fără layout shift), client components doar pentru meniu, configurator, cutia de mostre și formulare. Ținte pe mobil: LCP < 2,5 s, CLS < 0,05, Lighthouse ≥ 95 la Performance, Accessibility, Best Practices și SEO.
- **Evenimente** (Vercel Web Analytics, Pro): `config_start`, `config_step` (pasul), `quote_submit`, `contact_submit`, `samples_add`, `samples_submit`, `whatsapp_click`, `phone_click`. UTM-urile și referrer-ul se salvează în `leads.source`, ca să știi de unde vin cererile.

---

## 11. Medii, deploy, variabile

| Mediu | Vercel | Supabase | Notificări |
|---|---|---|---|
| Local | `pnpm dev` | Supabase local (`supabase start`, Docker) + `seed.sql` | `NOTIFY_DRY_RUN=1`: doar log în consolă |
| Preview | fiecare PR | proiectul **staging** (Free) | doar către tine (`NOTIFY_EMAIL` e al tău) |
| Production | branch-ul `main` | proiectul **prod** (Pro, `eu-central-1`) | atelierul |

- **Migrațiile** se fac cu `supabase migration new <nume>`, apoi `supabase db push` pe staging și, după merge, pe prod (manual sau dintr-un GitHub Action). Tipurile se generează cu `supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts`.
- **Regiunea funcțiilor**: `fra1` (`vercel.json` → `"regions": ["fra1"]`), lângă baza de date.
- **Cron** (`vercel.json`): `retry-notifications` la 15 minute, `purge-pending` zilnic, `retention` săptămânal.

| Variabilă | Unde | Notă |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | toate | `https://domeniu.ro` |
| `NEXT_PUBLIC_SUPABASE_URL` | toate | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | toate | `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | server | `sb_secret_…`, niciodată în client |
| `RESEND_API_KEY` | server | |
| `EMAIL_FROM` | server | `[Nume atelier] <cereri@domeniu.ro>` |
| `NOTIFY_EMAIL` | server | emailul atelierului (în Preview, al tău) |
| `NOTIFY_DRY_RUN` | local | `1` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | toate / server | în dev și în teste, cheile de test Cloudflare |
| `REVALIDATE_SECRET`, `CRON_SECRET`, `IP_HASH_SALT`, `FORM_HMAC_SECRET` | server | secrete aleatorii de 32 de octeți |

**DNS**
- Domeniul pointează spre Vercel.
- Pentru Resend: verifici domeniul de trimitere (înregistrările SPF și DKIM pe care le dă Resend; un subdomeniu ca `mail.domeniu.ro` păstrează reputația domeniului principal) și adaugi `_dmarc` cu `p=none` la început.

---

## 12. Testare

- **Vitest**:
  - `resolve()`: reguli, valori invalide, dimensiuni nestandard
  - `bedGeometry()`: snapshot pentru 8 combinații (inclusiv 200 cm + noptiere, 90 cm cu o pernă, ladă, sertare)
  - `configCode()`, `caption()`, `estimatePrice()` (prag de lățime, procente, rotunjire)
  - `configFromParams` / `paramsFromConfig` (round-trip)
  - subiectele emailurilor (§6.4)
  - schemele zod
- **Playwright + `@axe-core/playwright`**:
  - Acasă se încarcă fără erori de accesibilitate
  - configuratorul: alegi opțiuni, URL-ul și codul se schimbă, trimiți (Turnstile cu cheile de test, `NOTIFY_DRY_RUN=1`) și vezi confirmarea cu codul
  - Materiale: 5 mostre, a șasea e blocată, trimiți
  - meniul mobil la 390px
- **Vizual**: capturi Playwright la 1440 și la 390 pentru fiecare pagină, comparate cu canvasul.
- **CI** (GitHub Actions): `pnpm lint`, `pnpm typecheck`, `pnpm test`, Playwright pe URL-ul de preview.

---

## 13. Planul de lucru cu Claude Code

Fiecare fază e un branch și un PR, cu preview pe Vercel. La fiecare fază îi dai lui Claude Code promptul de mai jos și verifici „Gata când”.

| Fază | Ce iese | Gata când |
|---|---|---|
| **0. Setup** | repo GitHub, `create-next-app` (TS, App Router, Tailwind v4, pnpm), proiect Vercel legat de repo, proiectele Supabase prod + staging, `.env.example`, `CLAUDE.md` + `docs/` | `pnpm dev` merge, preview-ul se deschide, `next dev` a generat `AGENTS.md` |
| **1. Design system + pagini statice** | tokenii, fonturile, componentele din DESIGN §3, Acasă, Materiale (UI), Lucrări, Contact, legale, 404, cu datele din seed | capturile la 1440/390 corespund canvasului, axe fără erori, Lighthouse ≥ 95 |
| **2. Configuratorul** | `lib/configurator` + teste, pașii 01–06, desenul SVG, starea în URL, fișa, bara de mobil, linkul WhatsApp | toate combinațiile se desenează corect, testele trec, URL-ul reproduce configurația |
| **3. Backend formulare** | migrația 0001, RLS, buckets, Server Actions, upload-uri, Turnstile, rate limit, Resend, `after()`, `lead_events`, cron-uri | o cerere de test ajunge în DB, emailurile pleacă cu PNG-ul, retry-ul merge |
| **4. Conținut real** | `scripts/import-catalog.ts` (Excelul atelierului → Supabase), `scripts/upload-media.ts`, textele finale, setările | niciun placeholder `[…]` rămas pe site (test automat care caută `[` în HTML-ul randat) |
| **5. Lansare** | domeniu, DNS Resend, texte GDPR, evenimente analytics, JSON-LD, sitemap, linkul din Google Business | test complet pe telefon real (iPhone + Android), cerere reală primită de atelier |
| **6. După lansare** | `/admin`, pagini pe model, lightbox pe lucrări, „Vreau unul asemănător” | atelierul își gestionează singur cererile și catalogul |

**Prompturi de pornire** (copy-paste în Claude Code):

- **Faza 1**: „Citește CLAUDE.md și docs/DESIGN.md §0–4. Implementează tokenii din §2.7 în app/globals.css și componentele din §3 în components/site. Apoi construiește pagina Acasă secțiune cu secțiune, exact cu textele din §4.1, cu datele din lib/configurator/catalog.seed.ts. Fă capturi Playwright la 1440 și 390 și compară-le cu specificația înainte să-mi spui că e gata.”
- **Faza 2**: „Implementează lib/configurator exact ca în docs/DESIGN.md §5 și docs/ARHITECTURA.md §7, cu teste Vitest. Apoi componenta Configurator după DESIGN §4.2 și §5.4–5.8. Desenul în SVG, cu cotele HTML suprapuse.”
- **Faza 3**: „Aplică migrația din docs/ARHITECTURA.md §5 pe Supabase-ul de staging (prin Supabase MCP sau CLI), generează tipurile, apoi implementează fluxurile din §6 și securitatea din §9. Notificările în modul dry-run până îți dau cheile.”

**Unelte pentru Claude Code**: `gh` CLI (repo și PR-uri), **Supabase MCP** (migrații, SQL, logs, advisors), **Vercel MCP** (deploy-uri, loguri, variabile de mediu), Playwright (capturi și teste).

---

## 14. Riscuri și decizii deschise

| Risc / decizie | Ce faci |
|---|---|
| Pozele reale întârzie | e blocantul principal pentru lansare; recomand fotograful (LISTA-ATELIER §4) |
| Atelierul nu vrea prețuri publice | `show_prices = false`: grila nu mai ajunge în browser, fișa arată doar nota |
| Atelierul nu citește emailurile | notificările de pe telefon pentru adresa `NOTIFY_EMAIL`; în v2 `/admin` arată cererile noi |
| Proprietatea conturilor | domeniul și Google pe atelier de la început; Vercel și Supabase se transferă la predare |

---

## 15. Surse

- Vercel, Fair Use Guidelines (uz comercial pe Hobby, rate pe Pro): https://vercel.com/docs/limits/fair-use-guidelines
- Vercel, Pricing (Pro: $20/lună cu $20 credit inclus): https://vercel.com/pricing
- Supabase, Pricing (Free: pauză după o săptămână, fără backup; Pro de la $25): https://supabase.com/pricing
- Resend, prețuri (Free: 3.000/lună, 100/zi): https://resend.com/docs/knowledge-base/what-is-resend-pricing
- Next.js 16.3 (AGENTS.md pentru agenți, Cache Components): https://nextjs.org/blog/next-16-3
