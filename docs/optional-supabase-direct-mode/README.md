# Optional: Supabase-direct mode (archived, NOT part of the app)

This folder keeps an alternative design that is **not used** by the application and is **not**
built, linted or tested:

```
React  --supabase-js-->  Supabase (Auth + Row Level Security + Realtime + Storage)  -->  PostgreSQL
```

In that design there is no Express server: the browser talks to Supabase directly, Supabase Auth
owns the users (`auth.users`), Row Level Security policies replace the `WHERE user_id = $n` checks,
and task attachments live in Supabase Storage.

## Why it is archived

The deployed application uses **Express + JWT + pg** with the schema in `db/schema.sql`
(its own `users` table with `password_hash`). The files here need a **different schema**
(`supabase/01_schema.sql`: a `profiles` table linked to `auth.users`, `user_id DEFAULT auth.uid()`,
RLS policies, a storage bucket). They do not work with `db/schema.sql`, and the two schemas must
never be applied to the same Supabase project (both define `public.tasks`).

## Contents

| Path | What it was |
|---|---|
| `supabase/01_schema.sql`, `02_rls.sql`, `03_realtime_storage.sql` | Schema, RLS policies, Realtime + Storage setup for this mode |
| `SUPABASE_SETUP.md` | Click-by-click setup guide for this mode |
| `frontend/src/api/supabaseApi.ts` | The Supabase adapter (needed `@supabase/supabase-js`) |
| `frontend/src/components/Attachments.tsx` | File attachments UI (Supabase Storage) |
| `frontend/src/api-contract-types.ts` | The old shared `Api` interface both adapters implemented |
| `frontend/tests/*` | Its tests (fake Supabase client) |

To revive it you would need a separate Supabase project, the three SQL files above, the
`@supabase/supabase-js` dependency, and an adapter layer in the frontend again. The full working
version is in the git history (commit `a607800`, "Baseline").

`supabase/express_mode_lockdown.sql` is **not** archived: it belongs to the Express design and stays
in `supabase/` (see the main README).
