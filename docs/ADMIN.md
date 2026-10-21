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
- **PR-9** adds the projects (Lucrări) and the reviews (Recenzii), with the consents.

## Indexing

Every `/admin` page carries `<meta name="robots" content="noindex, nofollow">` (`src/app/admin/layout.tsx`). From PR-10, `robots.txt` also disallows `/admin`.
