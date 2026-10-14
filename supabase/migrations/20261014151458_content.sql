-- Content tables (docs/ARHITECTURA.md §5, the "Catalog" and "Conținut" parts), as
-- settled in docs/PLAN.md PR-5: plus `bases.photo_path` and `projects.ticket_no`.
-- Public read only for active or published rows; `pricing` has no public policy
-- (the server reads it with the secret key). Additive only.

-- ───────────── Catalog ─────────────
create table public.models (
  id text primary key,                         -- 'capitonat'
  name text not null,
  note text not null,                          -- „Tapițat, cu nasturi”
  description text,                            -- the model card's text
  code text not null unique,                   -- 'CAP' (part of the configuration code)
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
  code text not null unique,                   -- 'CT01': stable, never reused
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  supplier text,
  supplier_code text,
  price_category text not null default 'A' check (price_category in ('A', 'B', 'C')),
  photo_path text,                             -- in the media bucket
  macro_path text,
  featured boolean not null default false,     -- shown on Acasă
  active boolean not null default true,
  sort int not null default 0
);
create index materials_family_idx on public.materials (family_id, sort);

create table public.model_families (           -- which families go on which model
  model_id text references public.models(id) on delete cascade,
  family_id text references public.material_families(id) on delete cascade,
  primary key (model_id, family_id)
);
create index model_families_family_idx on public.model_families (family_id);

create table public.bases (
  id text primary key,                         -- 'lemn' | 'metal' | 'lada' | 'sertare'
  name text not null,
  note text not null,
  code text not null unique,
  photo_path text,                             -- Materiale › Picioare și baze (4:3), in the media bucket
  sort int not null default 0,
  active boolean not null default true
);

-- Prices live apart and are NOT publicly readable: only the server reads them.
create table public.pricing (
  id int primary key default 1 check (id = 1),
  data jsonb not null,                         -- the Pricing type of ARHITECTURA §7
  updated_at timestamptz not null default now()
);

-- ───────────── Content ─────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  ticket_no text,                              -- „Nr. …” on the hero ticket (DESIGN §3.6)
  model_id text references public.models(id),
  width_cm int,
  length_cm int,
  material_id text references public.materials(id),
  base_id text references public.bases(id),
  extras text[] not null default '{}',
  city text,
  delivered_on date,
  config jsonb,                                -- for „Vreau unul asemănător” → configurator
  featured boolean not null default false,
  hero boolean not null default false,         -- the hero project (FOTO 01 + ticket)
  published boolean not null default false,
  client_consent boolean not null default false,
  sort int not null default 0
);
create index projects_model_idx on public.projects (model_id);
create index projects_material_idx on public.projects (material_id);
create index projects_base_idx on public.projects (base_id);

create table public.project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null,
  alt text not null,
  width int,
  height int,
  sort int not null default 0
);
create index project_photos_project_idx on public.project_photos (project_id, sort);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  city text,
  body text not null,
  model_label text,                            -- „Capitonat · 160 × 200”
  source text,                                 -- google / facebook / whatsapp
  consent boolean not null default false,
  published boolean not null default false,
  sort int not null default 0
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null                          -- the keys of src/lib/data/settings.seed.ts
);

-- ───────────── RLS ─────────────
do $$
declare t text;
begin
  foreach t in array array['models', 'material_families', 'materials', 'model_families', 'bases', 'pricing',
                           'projects', 'project_photos', 'reviews', 'settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Public read only for active or published content. pricing has no public policy.
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
-- Public bucket for the site's photos (projects, swatches, bases). Uploads happen
-- in Supabase Studio (the owner) or through the admin role; the site only reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy "admin_all_media" on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());
