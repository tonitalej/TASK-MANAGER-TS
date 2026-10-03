-- SUPABASE MODE schema (React -> Supabase directly, no Express).
-- Run in the Supabase SQL Editor. Use a project that does NOT also have db/schema.sql
-- applied: both files define public.tasks.
--
-- Difference from db/schema.sql: there is no "users" table with password_hash.
-- Supabase Auth owns users (auth.users, passwords hashed for you).
-- We only add a "profiles" table for our own user data.

BEGIN;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;   -- also drops its trigger
DROP TABLE IF EXISTS public.tasks;
DROP TABLE IF EXISTS public.profiles;
DROP FUNCTION IF EXISTS public.set_updated_at();
DROP FUNCTION IF EXISTS public.sync_completed_at();


-- ============ HELPER FUNCTIONS ============
CREATE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- With no Express service layer, "business rules" move into the database.
-- Express mode did this in task.repository.ts; here a trigger does it.
CREATE FUNCTION public.sync_completed_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.status = 'done' THEN
        NEW.completed_at = COALESCE(NEW.completed_at, now());
    ELSE
        NEW.completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;


-- ============ PROFILES (1:1 with auth.users) ============
CREATE TABLE public.profiles (
    id         UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- When someone signs up through Supabase Auth, create their profile automatically.
-- SECURITY DEFINER = runs with the function owner's rights (needed: the new user
-- has no permission to insert into profiles yet). search_path = '' is a security best practice.
CREATE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    INSERT INTO public.profiles (id, name)
    VALUES (NEW.id, COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'name'), ''), split_part(NEW.email, '@', 1)));
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============ TASKS ============
CREATE TABLE public.tasks (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- DEFAULT auth.uid(): the DB fills in the logged-in user, so the browser never sends user_id.
    user_id      UUID         NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    status       TEXT         NOT NULL DEFAULT 'todo',
    priority     TEXT         NOT NULL DEFAULT 'medium',
    due_date     DATE,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT tasks_title_valid     CHECK (char_length(trim(title)) >= 1),
    CONSTRAINT tasks_status_valid    CHECK (status IN ('todo', 'in_progress', 'done')),
    CONSTRAINT tasks_priority_valid  CHECK (priority IN ('low', 'medium', 'high')),
    CONSTRAINT tasks_completed_valid CHECK (status = 'done' OR completed_at IS NULL)
);

CREATE INDEX idx_tasks_user_created  ON public.tasks (user_id, created_at DESC);
CREATE INDEX idx_tasks_user_status   ON public.tasks (user_id, status);
CREATE INDEX idx_tasks_user_due_open ON public.tasks (user_id, due_date)
    WHERE status <> 'done' AND due_date IS NOT NULL;

CREATE TRIGGER trg_tasks_sync_completed BEFORE INSERT OR UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.sync_completed_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
