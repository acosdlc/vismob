-- Requests from the three forms (docs/ARHITECTURA.md §5, the "Cereri" part), the
-- notification journal, the private upload bucket, and the per-IP log of signed
-- upload URLs. The content tables (catalog, projects, reviews, settings) come in
-- PR-5. Additive only.

create type public.lead_kind as enum ('contact', 'configurator', 'mostre');
create type public.lead_status as enum ('nou', 'contactat', 'ofertat', 'castigat', 'pierdut', 'spam');

-- The admin role of the v2 panel: app_metadata.role = 'admin' on the Supabase user.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind public.lead_kind not null,
  status public.lead_status not null default 'nou',
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (char_length(phone) between 8 and 20),   -- E.164
  email text not null check (char_length(email) <= 254),             -- required: notifications are email only
  city text check (city is null or char_length(city) <= 120),
  address text check (address is null or char_length(address) <= 500),  -- samples only
  message text check (message is null or char_length(message) <= 4000),
  mattress_size text,                          -- contact form
  wants_measurement boolean not null default false,
  config jsonb,                                -- the configuration, normalised by the server
  config_code text,                            -- CAP-160x200-CT01-H120-LD
  price_estimate_ron int,
  sample_material_ids text[],
  consent_text text not null,                  -- the exact text the client ticked
  consent_at timestamptz not null default now(),
  source jsonb,                                -- page, utm_*, referrer, environment
  ip_hash text,                                -- sha256(ip + salt), for the rate limit
  notes text
);
create index leads_created_at_idx on public.leads (created_at desc);
create index leads_status_idx on public.leads (status);
create index leads_ip_recent_idx on public.leads (ip_hash, created_at desc);

create table public.lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  path text not null,
  mime text not null,
  size_bytes int not null
);
create index lead_files_lead_idx on public.lead_files (lead_id);

-- Notification journal; the retry cron (PR-6) re-sends the rows with ok = false.
create table public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  at timestamptz not null default now(),
  type text not null check (type in ('email_workshop', 'email_client')),
  ok boolean not null,
  detail jsonb
);
create index lead_events_lead_idx on public.lead_events (lead_id, type, at desc);

-- Signed upload URLs are issued before a lead exists; this is the store for the
-- "20 URLs per IP per hour" limit (ARHITECTURA §6.1). Purged by the PR-6 cron.
create table public.upload_requests (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index upload_requests_ip_idx on public.upload_requests (ip_hash, created_at desc);

-- RLS: no public policy. The site writes and reads with the secret key (server
-- only); the v2 admin panel reads through the admin role.
do $$
declare t text;
begin
  foreach t in array array['leads', 'lead_files', 'lead_events', 'upload_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Private bucket for the clients' photos. Uploads happen only through signed
-- upload URLs created by the server; reads only through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-uploads', 'lead-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admin_all_lead_uploads" on storage.objects for all to authenticated
  using (bucket_id = 'lead-uploads' and public.is_admin())
  with check (bucket_id = 'lead-uploads' and public.is_admin());
