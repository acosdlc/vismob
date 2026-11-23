# Admin panel: access

`/admin` is the workshop's panel (ARHITECTURA §8, PLAN PR-7 … PR-9). This note covers who can get in and how that is set up. Nothing here needs code changes.

## How access works

- **Sign-in**: email and password through Supabase Auth, on `/admin/login`. The Server Action `signIn` (`src/actions/admin/sign-in.ts`) signs in with the cookie client, then checks the role on the verified JWT claims. Magic link comes later, once Supabase email sending points at Resend.
- **The role**: `app_metadata.role = 'admin'` on the user. It is granted by SQL (below), never from the panel, and it travels in the JWT. A signed-in user without it is signed out again and told „Contul nu are drepturi de administrare”.
- **Three checks, same claim**: the proxy (`src/proxy.ts`) sends anonymous visitors of `/admin` to the login screen; the `(panel)` layout's guard (`requireAdmin()` in `src/lib/admin/auth.ts`) reads the session on every screen; every Server Action calls `getAdminSession()` before touching data. Underneath, row level security applies: the `admin_all` policies use `public.is_admin()`, which reads the same `app_metadata.role` claim, so even a bug in the panel cannot read or write more than the signed-in user may.
- **Data path**: every admin read and write goes through the signed-in user's cookie client (`src/lib/supabase/server.ts`). The secret key (`src/lib/supabase/admin.ts`) is never used in the panel.

## Creating the first user

1. Supabase dashboard → **Authentication → Users → Add user**: email and a password; tick **Auto Confirm User** so no confirmation email is needed.
2. Grant the role, through the `db-change` skill or the SQL editor:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = '<email>';
   ```

3. The user signs out and in again. The JWT carries the claim, so a session opened before the grant keeps its old claims until it is refreshed; signing in again is the sure way.

The same two steps add any further admin.

## Revoking access

- Remove the role and the user stays a plain account that cannot enter the panel:

  ```sql
  update auth.users
  set raw_app_meta_data = raw_app_meta_data - 'role'
  where email = '<email>';
  ```

- Or delete the user in **Authentication → Users**. Either way, a session still open keeps working until its token expires or the user signs out; to cut it at once, also sign the user out from the dashboard (**Users → … → Sign out user**).

## Screens

- **PR-7**: `/admin/login`, the guarded shell with its header (Panou / Cereri / Setări / „Vezi site-ul” / „Ieși”), the dashboard `/admin` (the count of new requests), `/admin/setari` (every settings key, `show_prices`) and `/admin/cereri` (list with filters and search; detail with the ticket, photos through signed URLs, status, notes, delete).
- **PR-8**: `/admin/catalog` (models, material families, materials grouped by family, bases; a material can be added, edited, deactivated or, when nothing references it, deleted; models, families and bases are edited only, their ids are fixed in code), the model ↔ family rules on each model, photos uploaded from the browser into the public `media` bucket (resized to 1600 px WebP; a replaced photo gets a new name so no cache keeps the old one), and `/admin/preturi`, the price grid with a live preview of three typical configurations. Every save expires the `catalog` or `pricing` cache tag, so the site shows the change on its next request.
- **PR-9**: `/admin/lucrari` (projects: title, ticket number, model, mattress size, material, base, extras, city, delivery date, the client's consent, `published`, `featured` for the Acasă gallery, `hero` for the big Acasă photo with the ticket, one project at a time; the photos of each project with alt text and order, the first one being the tile and hero photo), `/admin/recenzii` (reviews with the client's written consent, `published`, order), and the workshop photo of the „Atelierul” section, uploaded from Setări. Publishing a project or a review needs the consent ticked; the site shows only published rows with consent.
- **PR-10**: no new screen. When one of a request's two notification emails has failed three times (the `retry-notifications` cron, ARHITECTURA §6.1 step 4), the alert email „Notificare eșuată” reaches `NOTIFY_EMAIL` with the link „Deschide cererea”, which opens that request at `/admin/cereri/[id]`.

## Entering the content (PR-11)

The real content goes in through the panel, in this order, because each screen's values show up in the next one's forms and on the site:

1. **Setări**: every key, with `show_prices` as the workshop decided, the Google Business Profile link (`google_profile_url`) and the atelier photo. The footer, the hero ticket, the facts row and the FAQ answers read from here.
2. **Catalog**: the families' descriptions and specification tables, every material with its photo, supplier, supplier code and price category A/B/C (a code is assigned once and never reused; a colour no longer offered is deactivated, not deleted), the model texts and the model ↔ family rules, the bases' notes and photos.
3. **Prețuri**: the grid, checked against the three preview configurations.
4. **Lucrări**: the projects with their photos and the client's consent, `published`, `featured`, and exactly one `hero`.
5. **Recenzii**: with the written consent, `published`, order.

The catalogue and the grid can also arrive as a filled `docs/atelier/05-catalog.xlsx` (the template `npm run catalog:template` generates; `docs/LISTA-ATELIER.md` §8). Then `npm run catalog:import <file>` validates it, lists every problem, and writes two migrations (`<ts>_catalog_from_excel.sql`, `<ts>_pricing.sql`) that the session applies through the `db-change` skill; photos still go in through the panel. The template is built from the seed catalogue, so the Excel route goes before any catalogue edit in the panel (or the template is regenerated first): a new colour in the sheet gets the next free code of its family, and the migration stops before writing anything if the panel gave that code or id away meanwhile; a colour deactivated in the panel stays deactivated, and a supplier typed there is kept where the sheet's cell is empty. A migration does not expire the `catalog` and `pricing` cache tags the way a panel save does: after the Excel route, one save in Catalog and one in Prețuri (or a day, the cache's lifetime) puts the imported rows on the site.

The gate that proves no `[...]` placeholder is left (`tests/e2e/no-placeholders.spec.ts`) runs by hand against the preview, as `docs/LAUNCH.md` describes.

## Indexing

Every `/admin` page carries `<meta name="robots" content="noindex, nofollow">` (`src/app/admin/layout.tsx`). From PR-10, `robots.txt` also disallows `/admin`.
