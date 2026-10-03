// Tests OUR adapter code against a fake Supabase client that records calls.
// It checks paths, validation and cleanup logic. It does NOT prove the real Supabase service behaves the same.
import { describe, test, expect, vi } from 'vitest';

const calls: [string, unknown][] = [];
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bucket = {
  upload: vi.fn(async (path: string) => { calls.push(['upload', path]); return { error: null }; }),
  list: vi.fn(async () => ({ data: [{ id: '1', name: '123-a.txt', metadata: { size: 5 } }, { name: 'subfolder' }], error: null })),
  remove: vi.fn(async (paths: string[]) => { calls.push(['remove', paths]); return { error: null }; }),
  createSignedUrl: vi.fn(async (path: string, secs: number) => ({ data: { signedUrl: `https://x/${path}?exp=${secs}` }, error: null })),
};
const table = { delete: () => ({ eq: async () => ({ error: null }) }) };
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: USER } } } }) },
    storage: { from: () => bucket },
    from: () => table,
  }),
}));

const { supabaseApi } = await import('../src/api/supabaseApi');
const attachments = supabaseApi.attachments!; // defined in Supabase mode

describe('supabase adapter: attachments', () => {
  test('uploads under <user-id>/<task-id>/ with a sanitised, timestamped name', async () => {
    await attachments.upload('task-1', new File(['x'], 'my report (final)?.pdf'));
    const path = calls.find((c) => c[0] === 'upload')?.[1] as string;
    expect(path).toMatch(new RegExp(`^${USER}/task-1/\\d+-my_report_final_.pdf$`));
  });
  test('rejects files over 5 MB before calling Supabase', async () => {
    const big = new File(['x'], 'big.bin'); Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await expect(attachments.upload('task-1', big)).rejects.toThrow('5 MB');
  });
  test('list hides sub-folders and strips the timestamp prefix', async () => {
    expect(await attachments.list('task-1')).toEqual([{ path: `${USER}/task-1/123-a.txt`, name: 'a.txt', size: 5 }]);
  });
  test('openUrl asks for a 60-second signed URL', async () => {
    expect(await attachments.openUrl('p')).toContain('exp=60');
  });
  test("deleting a task also deletes that task's files", async () => {
    calls.length = 0;
    await supabaseApi.tasks.remove('task-1');
    expect(calls).toContainEqual(['remove', [`${USER}/task-1/123-a.txt`, `${USER}/task-1/subfolder`]]);
  });
});
