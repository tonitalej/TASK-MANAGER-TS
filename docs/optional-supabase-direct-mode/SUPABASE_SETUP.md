# Supabase setup, step by step

## Which database do I put in Supabase?

Put **the Supabase-mode database**: the three files in `supabase/`, in a **new project**.

| You want to run | Put this in Supabase |
|---|---|
| **React → Supabase directly** (Auth + RLS + Realtime + Storage) ← start here | `supabase/01_schema.sql`, `02_rls.sql`, `03_realtime_storage.sql` |
| Express backend using Supabase only as a hosted database (optional, later) | `db/schema.sql`, `db/seed.sql`, then `supabase/express_mode_lockdown.sql` |

**Never put both in the same project.** Both create `public.tasks`, and the two designs are incompatible: Express mode has its own `users` table with `password_hash`, while Supabase mode uses Supabase Auth. For Express mode without a hosted database, plain local PostgreSQL is simplest.

Do NOT run `db/seed.sql` in Supabase mode. Seeded users there would have no Supabase Auth login. You sign up through the app instead.

---

## Part 1: Create the project

1. Go to supabase.com/dashboard, sign in, and click **New project**.
2. Choose an organization, a name (for example `task-manager`), and a region near you.
3. Set a **database password** and save it in a password manager. You only need it for Express mode, but it can't be viewed again later.
4. Click **Create new project** and wait for it to finish provisioning.

## Part 2: Create the tables (SQL Editor)

Open **SQL Editor** in the left sidebar. For each file below: **New query** → paste the whole file → **Run**. Run them **in this order**.

1. `supabase/01_schema.sql`: tables, triggers, the automatic profile on signup.
   The editor may warn about "destructive" statements (the `DROP ... IF EXISTS` lines). On a fresh project that's expected; confirm.
2. `supabase/02_rls.sql`: Row Level Security policies.
3. `supabase/03_realtime_storage.sql`: Realtime on `tasks`, the private `task-attachments` bucket and its policies.

Each should end with "Success. No rows returned". If one errors, stop and fix it before running the next, because they depend on each other.

**Check it worked** (Table Editor, left sidebar): you should see `profiles` and `tasks`, each with a "RLS enabled" indicator. Under **Storage** you should see the private bucket `task-attachments`.

## Part 3: Auth setting for development

Go to **Authentication → Providers → Email** and turn **Confirm email** off. With it on, sign-up creates the user but returns no session until they click an emailed link, so the app can't log you in straight away. Turn it back on before a real launch.

## Part 4: Connect the frontend

1. Dashboard → **Settings → API Keys**. Copy the **Project URL** (it may also be shown in the **Connect** dialog) and the **publishable key** (`sb_publishable_...`). If your project only shows legacy keys, use the `anon` key. Do **not** copy the secret / `service_role` key.
2. In `frontend/`: `cp .env.example .env` and fill in:
   ```
   VITE_BACKEND=supabase
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
3. `npm install` then `npm run dev`, and open http://localhost:5173. You do **not** need to start the Express backend in this mode.

## Part 5: Prove every piece works

| # | Do this | Expect | Proves |
|---|---|---|---|
| 1 | Register in the app | Lands on "My tasks" | Auth + no-confirm setting |
| 2 | Table Editor → `profiles` | A row with your name | The signup trigger |
| 3 | Add a task, click its badge until "Done" | Status changes; `completed_at` is filled in Table Editor | Insert + DB trigger |
| 4 | Click 📎 on a task, upload a small file | File appears; Storage → `task-attachments` → `<your-user-id>/<task-id>/` | Storage + policies |
| 5 | Open the app in a 2nd tab, add a task in tab 1 | Appears in tab 2 without refresh | Realtime |
| 6 | Log out, register a second account | Sees **no** tasks from the first account | RLS |
| 7 | Try uploading a file over 5 MB | "File is larger than 5 MB" | Size limit |

If #6 ever shows another user's tasks, RLS isn't applied: re-run `02_rls.sql` and check the Table Editor shows RLS enabled.

## Common problems

- **"Check your email to confirm your account"**: Confirm email is still on (Part 3).
- **Login works but tasks never load / permission denied**: `02_rls.sql` wasn't run, or ran with an error.
- **Upload fails with a policy error**: `03_realtime_storage.sql` wasn't run, or the file path doesn't start with your user id (the app does this automatically).
- **Realtime never fires**: the `tasks` table isn't in the `supabase_realtime` publication; re-run `03_realtime_storage.sql`.
- **Blank page with a red "Set VITE_SUPABASE_URL…" message**: `frontend/.env` is missing or you didn't restart `npm run dev` after editing it.

## Optional later: Express backend on Supabase (Path A)

Use a second project (free plans may limit how many projects you can have; check your dashboard).
1. SQL Editor: run `db/schema.sql`, `db/seed.sql`, then `supabase/express_mode_lockdown.sql` (**important**: it stops anyone reading your `users` table through Supabase's own API).
2. Click **Connect** in the dashboard and copy a PostgreSQL connection string into `backend/.env` as `DATABASE_URL`, with your database password, and set `DATABASE_SSL=true`. If your network lacks IPv6, use the pooler connection string offered in the same dialog.
3. `VITE_BACKEND=express` in `frontend/.env`, start the backend and the frontend as usual.
