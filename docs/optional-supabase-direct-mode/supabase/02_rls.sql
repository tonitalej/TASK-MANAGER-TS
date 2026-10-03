-- ROW LEVEL SECURITY: the authorization layer when the browser talks to the DB directly.
--
-- In Express mode:   WHERE user_id = $1  (written by you, in every query)
-- In Supabase mode:  policies below       (enforced by Postgres on EVERY query, automatically)
--
-- The browser holds the public "anon key" and a user JWT. Anyone can read that key from
-- the page source, so RLS is not optional: without it, every row is exposed.

BEGIN;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks    ENABLE ROW LEVEL SECURITY;

-- Table privileges (layer 1) + policies (layer 2). Both must allow the action.
REVOKE ALL ON public.profiles, public.tasks FROM anon;           -- logged-out visitors: nothing
GRANT SELECT, UPDATE                 ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks    TO authenticated;

-- (select auth.uid()) instead of auth.uid(): wrapping it lets Postgres evaluate it once per
-- query instead of once per row (a documented Supabase performance tip).
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

-- USING      = which EXISTING rows you may see / change / delete
-- WITH CHECK = what a NEW or CHANGED row must look like (stops you inserting rows for others)
CREATE POLICY tasks_select_own ON public.tasks FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
CREATE POLICY tasks_insert_own ON public.tasks FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY tasks_update_own ON public.tasks FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY tasks_delete_own ON public.tasks FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

COMMIT;
