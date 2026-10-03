-- REALTIME + STORAGE (Supabase-only; this file does not run on plain PostgreSQL)

-- ============ REALTIME ============
-- Realtime streams row changes to subscribed browsers. A table must be added to the
-- "supabase_realtime" publication first. RLS still applies: users only receive their own rows.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tasks') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
    END IF;
END $$;

-- ============ STORAGE ============
-- A private bucket for task attachments. Files live at  <user-id>/<task-id>/<timestamp>-<filename>
-- and the policies only allow access to paths whose first folder is your own user id.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('task-attachments', 'task-attachments', false, 5242880)   -- 5 MB, enforced server-side
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS attachments_select_own ON storage.objects;
CREATE POLICY attachments_select_own ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS attachments_insert_own ON storage.objects;
CREATE POLICY attachments_insert_own ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS attachments_delete_own ON storage.objects;
CREATE POLICY attachments_delete_own ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
