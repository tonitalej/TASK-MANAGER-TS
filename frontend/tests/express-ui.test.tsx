// Click-through test of the REAL app against the REAL backend (no fake API).
// Start the backend against the TEST database first:  cd backend && npm run build && npm run start:testdb
// If nothing answers on http://localhost:3000, this whole file is skipped (with a message).
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './render';

const BACKEND = 'http://localhost:3000';
const realFetch = globalThis.fetch;
const backendUp = await realFetch(`${BACKEND}/api/health`).then((r) => r.ok, () => false);
if (!backendUp) console.warn(`[express-ui] skipped: no healthy backend at ${BACKEND} (run "npm run start:testdb" in backend/).`);

// The app calls relative URLs like /api/tasks (Vite's dev proxy forwards them in the browser).
// There is no Vite server in tests, so send them straight to the backend.
beforeEach(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    realFetch(typeof input === 'string' && input.startsWith('/') ? `${BACKEND}${input}` : input, init));
});

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe.skipIf(!backendUp)('real backend click-through', () => {
  test('register, create, edit, search, delete, log out, log back in', async () => {
    const user = userEvent.setup();
    const email = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const password = 'Secret1234';
    const title = `UI task ${Date.now()}`;
    renderApp('/register');

    // register a brand-new user: the dashboard starts empty
    await user.type(await screen.findByLabelText('Name'), 'UI Tester');
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await heading('My tasks');
    expect(await screen.findByText('No tasks yet.', { exact: false })).toBeInTheDocument();

    // create
    await user.click(screen.getByRole('link', { name: 'New task' }));
    await heading('New task');
    await user.type(screen.getByLabelText('Title'), title);
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await heading(title)).toBeInTheDocument();

    // edit
    await user.click(screen.getByRole('link', { name: 'Edit' }));
    await heading('Edit task');
    await user.selectOptions(screen.getByLabelText('Status'), 'done');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Task updated.')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();

    // search + filter on the dashboard
    await user.click(screen.getByRole('link', { name: '← Back to my tasks' }));
    await screen.findByRole('link', { name: title });
    await user.selectOptions(screen.getByLabelText('Status'), 'todo');
    expect(await screen.findByText('No tasks match your search or filters.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), '');
    await user.type(screen.getByLabelText('Search'), 'UI task');
    expect(await screen.findByRole('link', { name: title })).toBeInTheDocument();

    // delete (confirmed)
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: `Delete ${title}` }));
    await waitFor(() => { expect(screen.queryByRole('link', { name: title })).not.toBeInTheDocument(); });

    // log out, then log in again with the same account
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await heading('Log in');
    expect(localStorage.getItem('tm_token')).toBeNull();
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await heading('My tasks')).toBeInTheDocument();
  });

  test('a wrong password is rejected by the server', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'nobody@example.com');
    await user.type(screen.getByLabelText('Password'), 'Wrong12345');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  test('an invalid saved token sends the user to the login page', async () => {
    localStorage.setItem('tm_token', 'garbage.token.value');
    renderApp('/');
    expect(await heading('Log in')).toBeInTheDocument();
    expect(localStorage.getItem('tm_token')).toBeNull();
  });
});
