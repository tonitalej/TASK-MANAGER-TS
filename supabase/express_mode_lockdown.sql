-- ONLY if you use the EXPRESS backend (db/schema.sql) on a Supabase project.
--
-- Supabase automatically exposes every table in the "public" schema through its own REST API,
-- reachable with the public anon key. Without this file, ANYONE could read your users table
-- (including password hashes) straight from the browser, bypassing Express completely.
--
-- Enabling RLS with ZERO policies = deny everything for anon/authenticated.
-- Express is not affected: it connects as the "postgres" role, which bypasses RLS.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users, public.tasks FROM anon, authenticated;
