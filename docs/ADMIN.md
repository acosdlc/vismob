# Admin panel: access

`/admin` is the workshop's panel (ARHITECTURA §8, PLAN PR-7 … PR-9). This note covers who can get in and how that is set up. Nothing here needs code changes.

## How access works

- **Sign-in**: email and password through Supabase Auth, on `/admin/login`. The Server Action `signIn` (`src/actions/admin/sign-in.ts`) signs in with the cookie client, then checks the role on the verified JWT claims. Magic link comes later, once Supabase email sending points at Resend.
- **The role**: `app_metadata.role = 'admin'` on the user. It is granted by SQL (below), never from the panel, and it travels in the JWT. A signed-in user without it is signed out again and told „Contul nu are drepturi de administrare”.
- **Three checks, same claim**: the proxy (`src/proxy.ts`) sends anonymous visitors who open a page of `/admin` (GET, HEAD) to the login screen; the `(panel)` layout's guard (`requireAdmin()` in `src/lib/admin/auth.ts`) reads the session on every screen; every Server Action calls `getAdminSession()` before touching data. A Server Action call is a POST and passes the proxy on purpose: the action itself answers „Sesiunea a expirat sau nu ai acces. Intră din nou în cont.” and the form keeps what was typed. So every action under `src/actions/admin` must open with that check, and must be written as `export async function name(` at the start of a line; `session-check.test.ts` in that folder fails when one does not, or when an action is exported as a const, in an export list or as the default. Underneath, row level security applies: the `admin_all` policies use `public.is_admin()`, which reads the same `app_metadata.role` claim, so even a bug in the panel cannot read or write more than the signed-in user may.
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
- „Ieși” in the panel ends the session of that browser only. A session left open on another device stays valid until „Ieși” is pressed there or the user is signed out from the dashboard.

## Screens

- **PR-7**: `/admin/login`, the guarded shell with its header (Panou / Cereri / Setări / „Vezi site-ul” / „Ieși”), the dashboard `/admin` (the count of new requests), `/admin/setari` (every settings key, `show_prices`) and `/admin/cereri` (list with filters and search; detail with the ticket, photos through signed URLs, status, notes, delete).
- **PR-8**: `/admin/catalog` (models, material families, materials grouped by family, bases; a material can be added, edited, deactivated or, when nothing references it, deleted; models, families and bases are edited only, their ids are fixed in code), the model ↔ family rules on each model, photos uploaded from the browser into the public `media` bucket (resized to 1600 px WebP; the original may be of any size, since the bucket's 10 MB limit is checked on the resized file; a replaced photo gets a new name so no cache keeps the old one), and `/admin/preturi`, the price grid with a live preview of three typical configurations. Every save expires the `catalog` or `pricing` cache tag (a catalogue save also `projects`, whose captions carry colour and base names), so the site shows the change on its next request.
- **PR-9**: `/admin/lucrari` (projects: title, ticket number, model, mattress size, material, base, extras, city, delivery date, the client's consent, `published`, `featured` for the Acasă gallery, `hero` for the big Acasă photo with the ticket, one project at a time; the photos of each project with alt text and order, the first one being the tile and hero photo), `/admin/recenzii` (reviews with the client's written consent, `published`, order), and the workshop photo of the „Atelierul” section, uploaded from Setări. Publishing a project or a review needs the consent ticked; a project also needs at least one photo, so it is created unpublished and published from its own screen, and the last photo of a published project cannot be deleted (replace it in the same save, or untick „Publicat” first). The site shows only published rows with consent.
- **PR-13**: no new screen; the rules the screens follow (docs/PLAN.md, PR-13). In short: „Salvat.” hides at the first edit after a save; a save that brings no answer (connection lost, a deployment made meanwhile) keeps the form and what was typed and shows „Nu am putut salva. Încearcă din nou.”; every text in Setări is required unless the site hides it when empty, and a save is refused when someone else saved Setări meanwhile; a project is published only with a photo; an emptied „Ordine” puts a new colour last and is refused on an existing one; a price under 100 lei in the grid is refused as a thousands-point slip, and under a base or an extra only an amount typed with a point between thousands (1.200) is; the specification grid and the „Adaugă o poză” block are held while their save runs; every catalogue save also expires the `projects` tag; the request's configuration sheet is resolved against the whole catalogue.
- **PR-10**: no new screen. When one of a request's two notification emails has failed three times (the `retry-notifications` cron, ARHITECTURA §6.1 step 4), the alert email „Notificare eșuată” reaches `NOTIFY_EMAIL` with the link „Deschide cererea”, which opens that request at `/admin/cereri/[id]`. While Production lacks `RESEND_API_KEY` or `EMAIL_FROM` nothing is attempted and no alert can be sent (docs/LAUNCH.md §0).

## Entering the content (PR-11)

The real content goes in through the panel, in this order, because each screen's values show up in the next one's forms and on the site:

1. **Setări**: every key, with `show_prices` as the workshop decided, the Google Business Profile link (`google_profile_url`, read by search engines only; no page shows it) and the atelier photo. The footer, the facts row and the FAQ answers read from here (the hero ticket comes from the hero project). Every text is required; a value not known yet keeps its `[...]` placeholder. „Telefon” is one number that dials as typed (a landline goes in as 0264 123 456, not 0264/123.456), „Email” one valid address, and for these two the placeholder passes only as one whole bracket; WhatsApp is stored in the international form whichever way it is typed. One person edits Setări at a time.
2. **Catalog**: the families' descriptions and specification tables (every filled row is shown, up to six), every material with its photo, supplier, price category A/B/C and, where there is one, the supplier code, shown in the configurator only when filled (a code is assigned once and never reused; a colour no longer offered is deactivated, not deleted; a new colour with an empty „Ordine” goes last), the model texts and the model ↔ family rules, the bases' notes and photos (three cards on Materiale: wooden legs, metal legs, and one for the storage bases).
3. **Prețuri**: the grid, checked against the three preview configurations. Amounts are typed without a thousands separator (3450, not 3.450). An empty cell does not take the width off the site: the bed takes the price of the next filled width or, with none wider, of the widest filled one, so every width the workshop makes gets its own price; a model whose row is entirely empty has no price on the site.
4. **Lucrări**: each project is saved first, then gets its photos, then the client's consent and `published`; `featured` for the gallery, and exactly one `hero`.
5. **Recenzii**: with the written consent, `published`, order.

The catalogue and the grid can also arrive as a filled `docs/atelier/05-catalog.xlsx` (the template `npm run catalog:template` generates; `docs/LISTA-ATELIER.md` §8). Then `npm run catalog:import <file>` validates it, lists every problem, and writes two migrations (`<ts>_catalog_from_excel.sql`, `<ts>_pricing.sql`) that the session applies through the `db-change` skill; photos still go in through the panel. The template is built from the seed catalogue, so the Excel route goes before any catalogue edit in the panel (or the template is regenerated first): a new colour in the sheet gets the next free code of its family, and the migration stops before writing anything if the panel gave that code or id away meanwhile; a colour deactivated in the panel stays deactivated, and a supplier typed there is kept where the sheet's cell is empty. The import's price rules differ from the panel's in two places: it refuses any base amount above 0 and under 100 lei (such a base gets a passing value in the sheet and its true price in Prețuri afterwards), and it does not check the two extras for the thousands-point slip, so „LED sub pat” and „2 noptiere” are read in the generated pricing migration before it is applied. A migration does not expire the `catalog` and `pricing` cache tags the way a panel save does: after the Excel route, one save in Catalog and one in Prețuri (or a day, the cache's lifetime) puts the imported rows on the site.

The gate that proves no `[...]` placeholder and no FOTO box is left (`tests/e2e/no-placeholders.spec.ts`) runs by hand against the preview, as `docs/LAUNCH.md` describes.

## Indexing

Every `/admin` page carries `<meta name="robots" content="noindex, nofollow">` (`src/app/admin/layout.tsx`). From PR-10, `robots.txt` also disallows `/admin`.
