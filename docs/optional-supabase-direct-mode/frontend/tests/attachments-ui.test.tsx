// The Attachments UI with a FAKE api object (no network). Verifies the UI logic only.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Attachment, Task } from '../src/types';

const store: Attachment[] = [];
const fakeApi = {
  attachments: {
    list: vi.fn(async () => [...store]),
    upload: vi.fn(async (taskId: string, file: File) => {
      if (file.size > 5 * 1024 * 1024) throw new Error('File is larger than 5 MB');
      store.push({ path: `u/${taskId}/${file.name}`, name: file.name, size: file.size });
    }),
    openUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
    remove: vi.fn(async (path: string) => { store.splice(store.findIndex((f) => f.path === path), 1); }),
  },
};
vi.mock('../src/api', () => ({ api: fakeApi }));

const { default: TaskItem } = await import('../src/components/TaskItem');
const task: Task = {
  id: 't1', user_id: 'u', title: 'Has files', status: 'todo', priority: 'low', due_date: null,
  description: null, completed_at: null, created_at: '', updated_at: '',
};

beforeEach(() => { store.length = 0; vi.clearAllMocks(); });

describe('attachments UI', () => {
  test('upload, list, open via signed URL, delete', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ul><TaskItem task={task} onUpdate={() => {}} onDelete={() => {}} /></ul>);

    await user.click(screen.getByRole('button', { name: 'Attachments' }));
    await user.upload(screen.getByLabelText('Upload attachment'), new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('button', { name: 'notes.txt' })).toBeInTheDocument();
    expect(fakeApi.attachments.upload).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'notes.txt' }));

    await user.click(screen.getByRole('button', { name: 'notes.txt' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/u/t1/notes.txt', '_blank', 'noopener'));

    await user.click(screen.getByRole('button', { name: 'Delete notes.txt' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'notes.txt' })).not.toBeInTheDocument());
  });

  test('upload errors are shown to the user', async () => {
    const user = userEvent.setup();
    render(<ul><TaskItem task={task} onUpdate={() => {}} onDelete={() => {}} /></ul>);
    await user.click(screen.getByRole('button', { name: 'Attachments' }));
    const big = new File(['x'], 'huge.bin');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await user.upload(screen.getByLabelText('Upload attachment'), big);
    expect(await screen.findByText('File is larger than 5 MB')).toBeInTheDocument();
  });
});
