-- A published project keeps the name of its colour and of its base after the workshop
-- switches that row off. The site prints them in the project's caption („Catifea, verde
-- sticlă”) and in the hero ticket, from public.materials and public.bases, read with the
-- publishable key (src/lib/data/projects.ts). The "public_read" policies of
-- 20261014151458_content.sql return active rows only, so a switched-off colour or base
-- dropped out of every project that shows it, although the panel tells the workshop to
-- switch a colour off instead of deleting it when a project uses it.
--
-- Additive only: one more permissive select policy on each of the two tables, next to
-- "public_read" (permissive policies are OR-ed). Same pattern as "public_read" on
-- public.project_photos: the row is readable while a project that is published with the
-- client's consent refers to it. The two columns the policies look up are indexed
-- (projects_material_idx, projects_base_idx).
--
-- What an anonymous reader gains: the whole row (every column, as for an active row; for
-- a material that includes supplier, supplier_code and price_category) of a material or
-- a base that is switched off AND is the material_id or base_id of at least one project
-- with published and client_consent. A switched-off row that no such project uses stays
-- hidden, and so does everything else: models, pricing, unpublished projects.
--
-- These rows must not come back into the configurator or onto /materiale: the site's
-- catalogue reader asks for active rows itself (src/lib/data/catalog.ts), in the same
-- pull request as this file. Applied on 2026-11-23, shortly before that code went live,
-- while public.projects was empty and no colour or base was switched off: with no
-- published project the two policies return no extra row, so the order did not matter.

create policy "public_read_in_project" on public.materials for select to anon, authenticated using (
  exists (select 1 from public.projects p where p.material_id = materials.id and p.published and p.client_consent));

create policy "public_read_in_project" on public.bases for select to anon, authenticated using (
  exists (select 1 from public.projects p where p.base_id = bases.id and p.published and p.client_consent));
