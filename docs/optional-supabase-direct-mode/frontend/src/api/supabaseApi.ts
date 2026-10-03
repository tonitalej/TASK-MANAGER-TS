// Adapter 2: talks to Supabase directly. There is NO Express here:
//   login        -> Supabase Auth
//   permissions  -> RLS policies in the database
//   rules        -> constraints + triggers in the database
import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';
import type { Api, Attachment, NewTask, Task, TaskChanges, TaskFilters, User } from '../types';

const url = import.meta.env.VITE_SUPABASE_URL;
// Supabase's newer name is "publishable key" (sb_publishable_...); the legacy name is "anon key". Either works.
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

const BUCKET = 'task-attachments';
const MAX_BYTES = 5 * 1024 * 1024; // keep in sync with file_size_limit in 03_realtime_storage.sql

// All adapter code runs only when configError is null, so the client exists.
const client = (): SupabaseClient => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};
const fail = (error: { message: string } | null): void => { if (error) throw new Error(error.message); };
const toUser = (u: SupabaseUser | null | undefined): User | null =>
  u ? { id: u.id, email: u.email ?? '', name: (u.user_metadata?.name as string | undefined) || u.email || '' } : null;

async function currentUserId(): Promise<string> {
  const { data } = await client().auth.getSession();
  if (!data.session) throw new Error('Not logged in');
  return data.session.user.id;
}
// Storage keys reject many characters, so keep only safe ones.
const safeFileName = (name: string): string => name.replace(/[^\w.-]+/g, '_').slice(-100);
let channelCount = 0;

export const supabaseApi: Api = {
  label: 'Supabase (Auth + RLS + Realtime + Storage)',
  auth: {
    register: async (name, email, password) => {
      const { data, error } = await client().auth.signUp({ email, password, options: { data: { name } } });
      fail(error);
      // If "Confirm email" is ON in Supabase there is no session until the user clicks the email link.
      if (!data.session) throw new Error('Check your email to confirm your account, then log in.');
      return toUser(data.user) as User;
    },
    login: async (email, password) => {
      const { data, error } = await client().auth.signInWithPassword({ email, password });
      fail(error);
      return toUser(data.user) as User;
    },
    logout: async () => { fail((await client().auth.signOut()).error); },
    currentUser: async () => toUser((await client().auth.getSession()).data.session?.user),
    onSignedOut: (cb) => {
      const { data } = client().auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') cb(); });
      return () => data.subscription.unsubscribe();
    },
  },
  tasks: {
    // No user_id filter anywhere: RLS only returns the logged-in user's rows.
    list: async ({ status, priority }: TaskFilters = {}) => {
      let q = client().from('tasks').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      if (priority) q = q.eq('priority', priority);
      const { data, error } = await q;
      fail(error);
      return (data ?? []) as Task[];
    },
    create: async (task: NewTask) => {
      const { data, error } = await client().from('tasks').insert(task).select().single(); // user_id defaults to auth.uid()
      fail(error);
      return data as Task;
    },
    update: async (id: string, changes: TaskChanges) => {
      const { data, error } = await client().from('tasks').update(changes).eq('id', id).select().single();
      fail(error);
      return data as Task;
    },
    remove: async (id: string) => {
      // Storage files are NOT deleted by the database cascade, so clean them up first (best effort).
      try {
        const folder = `${await currentUserId()}/${id}`;
        const { data } = await client().storage.from(BUCKET).list(folder);
        if (data?.length) await client().storage.from(BUCKET).remove(data.map((f) => `${folder}/${f.name}`));
      } catch { /* the task delete below is what matters */ }
      fail((await client().from('tasks').delete().eq('id', id)).error);
    },
  },
  // Files live at  <user-id>/<task-id>/<timestamp>-<filename>
  // The storage policies only let you touch paths whose FIRST folder is your own user id.
  attachments: {
    list: async (taskId: string): Promise<Attachment[]> => {
      const folder = `${await currentUserId()}/${taskId}`;
      const { data, error } = await client().storage.from(BUCKET).list(folder, { sortBy: { column: 'created_at', order: 'desc' } });
      fail(error);
      return (data ?? [])
        .filter((f) => f.id) // folders have no id
        .map((f) => ({
          path: `${folder}/${f.name}`,
          name: f.name.replace(/^\d+-/, ''),
          size: (f.metadata as { size?: number } | null)?.size ?? null,
        }));
    },
    upload: async (taskId: string, file: File) => {
      if (file.size > MAX_BYTES) throw new Error('File is larger than 5 MB');
      const path = `${await currentUserId()}/${taskId}/${Date.now()}-${safeFileName(file.name)}`;
      fail((await client().storage.from(BUCKET).upload(path, file, { upsert: false })).error);
    },
    // Private bucket -> files are opened through a short-lived signed URL (60 s).
    openUrl: async (path: string) => {
      const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 60);
      fail(error);
      return (data as { signedUrl: string }).signedUrl;
    },
    remove: async (path: string) => { fail((await client().storage.from(BUCKET).remove([path])).error); },
  },
  // Realtime: the DB pushes changes to the browser (also from other tabs/devices).
  subscribe: (onChange) => {
    // channel() returns an EXISTING channel with the same topic, and removeChannel() is async,
    // so a fixed name would make .on() throw when React re-subscribes. Use a unique topic.
    const channel = client()
      .channel(`tasks-changes-${++channelCount}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
      .subscribe();
    return () => { void client().removeChannel(channel); };
  },
};
