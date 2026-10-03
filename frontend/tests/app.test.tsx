// UI tests for the whole app: real components, real router, real API client.
// Only fetch is replaced (by FakeApi), so no backend or database is needed.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeApi } from './fakeApi';
import { renderApp } from './render';
import type { User } from '../src/types';

let api: FakeApi;
let alice: User;

beforeEach(() => {
  api = new FakeApi();
  alice = api.addUser('Alice', 'alice@example.com', 'Secret1234');
  vi.stubGlobal('fetch', api.fetch);
});

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });

async function logIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('route guards', () => {
  test('a logged-out visitor is sent to the login page, then back to the page they wanted', async () => {
    const user = userEvent.setup();
    renderApp('/tasks/new');
    await heading('Log in');
    await logIn(user, 'alice@example.com', 'Secret1234');
    expect(await heading('New task')).toBeInTheDocument();
  });

  test('a logged-in user visiting /login goes to the dashboard', async () => {
    api.logInAs(alice);
    renderApp('/login');
    expect(await heading('My tasks')).toBeInTheDocument();
  });

  test('an unknown address shows "Page not found"', async () => {
    renderApp('/no/such/page');
    expect(await heading('Page not found')).toBeInTheDocument();
  });
});

describe('login', () => {
  test('empty fields show client-side errors and send no request', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(api.requests).toHaveLength(0);
  });

  test('a wrong password shows the server message and stays on the page', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await heading('Log in');
    await logIn(user, 'alice@example.com', 'Wrong12345');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(localStorage.getItem('tm_token')).toBeNull();
  });

  test('correct credentials open the dashboard and store the token', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await heading('Log in');
    await logIn(user, 'alice@example.com', 'Secret1234');
    expect(await heading('My tasks')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(localStorage.getItem('tm_token')).not.toBeNull();
  });

  test('a network failure shows a readable message', async () => {
    api.offline = true;
    const user = userEvent.setup();
    renderApp('/login');
    await heading('Log in');
    await logIn(user, 'alice@example.com', 'Secret1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });
});

describe('register', () => {
  async function fillRegister(user: ReturnType<typeof userEvent.setup>, name: string, email: string, password: string) {
    await user.type(await screen.findByLabelText('Name'), name);
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
  }

  test('invalid input is caught before any request', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    await fillRegister(user, 'B', 'not-an-email', 'onlyletters');
    expect(screen.getByText('Name must be 2-100 characters')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password must contain at least one letter and one number')).toBeInTheDocument();
    expect(api.requests).toHaveLength(0);
  });

  test('an email that is already registered shows the 409 message', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    await fillRegister(user, 'Another Alice', 'alice@example.com', 'Secret1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email is already registered');
  });

  test('a new account is created and logged in', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    await fillRegister(user, 'Bob', 'bob@example.com', 'Secret1234');
    expect(await heading('My tasks')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet.', { exact: false })).toBeInTheDocument();
    expect(localStorage.getItem('tm_token')).not.toBeNull();
  });
});

describe('session', () => {
  test('a saved token restores the session on page load', async () => {
    api.logInAs(alice);
    renderApp('/');
    expect(await heading('My tasks')).toBeInTheDocument();
  });

  test('an invalid saved token is removed and the login page is shown', async () => {
    localStorage.setItem('tm_token', 'garbage.token.value');
    renderApp('/');
    expect(await heading('Log in')).toBeInTheDocument();
    expect(localStorage.getItem('tm_token')).toBeNull();
  });

  test('a 401 during use clears the token and redirects with "session expired"', async () => {
    api.addTask(alice, { title: 'Write report' });
    api.logInAs(alice);
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByText('Write report');

    api.expired = true;
    await user.click(screen.getByRole('link', { name: 'Write report' }));

    expect(await heading('Log in')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired. Please log in again.');
    expect(localStorage.getItem('tm_token')).toBeNull();
  });

  test('log out forgets the token and returns to the login page', async () => {
    api.logInAs(alice);
    const user = userEvent.setup();
    renderApp('/');
    await heading('My tasks');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await heading('Log in')).toBeInTheDocument();
    expect(localStorage.getItem('tm_token')).toBeNull();
  });
});

describe('tasks', () => {
  beforeEach(() => { api.logInAs(alice); });

  test('the dashboard lists only my tasks and shows their status and priority', async () => {
    const bob = api.addUser('Bob', 'bob@example.com', 'Secret1234');
    api.addTask(alice, { title: 'Mine', status: 'in_progress', priority: 'high' });
    api.addTask(bob, { title: 'Not mine' });
    renderApp('/');
    const row = (await screen.findByRole('link', { name: 'Mine' })).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('In progress')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('High priority')).toBeInTheDocument();
    expect(screen.queryByText('Not mine')).not.toBeInTheDocument();
    expect(screen.getByText('1 task found')).toBeInTheDocument();
  });

  test('a load error shows a message and "Try again" reloads', async () => {
    api.addTask(alice, { title: 'Write report' });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByText('Write report');

    api.offline = true;
    await user.selectOptions(screen.getByLabelText('Status'), 'done');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tasks');

    api.addTask(alice, { title: 'Finished report', status: 'done' });
    api.offline = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Finished report')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('create: the title is required, then the new task opens', async () => {
    const user = userEvent.setup();
    renderApp('/tasks/new');
    await heading('New task');
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveFocus();

    await user.type(screen.getByLabelText('Title'), '  Buy milk  ');
    await user.type(screen.getByLabelText('Description (optional)'), 'Semi-skimmed');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await heading('Buy milk')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Task created.');
    expect(screen.getByText('Semi-skimmed')).toBeInTheDocument();
    expect(screen.getByText('High priority')).toBeInTheDocument();
    expect(api.taskTitles(alice)).toEqual(['Buy milk']);
  });

  test('edit: the form is pre-filled and saving shows the updated task', async () => {
    const task = api.addTask(alice, { title: 'Old title' });
    const user = userEvent.setup();
    renderApp(`/tasks/${task.id}/edit`);
    await heading('Edit task');
    const title = screen.getByLabelText('Title');
    expect(title).toHaveValue('Old title');

    await user.clear(title);
    await user.type(title, 'New title');
    await user.selectOptions(screen.getByLabelText('Status'), 'done');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await heading('New title')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Task updated.');
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  test('a task that does not exist (or is not mine) shows "Task not found"', async () => {
    const bob = api.addUser('Bob', 'bob@example.com', 'Secret1234');
    const bobsTask = api.addTask(bob, { title: 'Secret plan' });
    renderApp(`/tasks/${bobsTask.id}`);
    expect(await heading('Task not found')).toBeInTheDocument();
    expect(screen.queryByText('Secret plan')).not.toBeInTheDocument();
  });

  test('delete from the dashboard asks for confirmation first', async () => {
    api.addTask(alice, { title: 'Keep me' });
    api.addTask(alice, { title: 'Remove me' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Delete Remove me' }));
    expect(confirm).toHaveBeenCalledWith('Delete "Remove me"? This cannot be undone.');
    expect(api.taskTitles(alice)).toEqual(['Keep me', 'Remove me']);

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete Remove me' }));
    await waitFor(() => { expect(screen.queryByRole('link', { name: 'Remove me' })).not.toBeInTheDocument(); });
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Remove me".');
    expect(screen.getByRole('link', { name: 'Keep me' })).toBeInTheDocument();
    expect(api.taskTitles(alice)).toEqual(['Keep me']);
  });

  test('delete from the details page returns to the dashboard', async () => {
    const task = api.addTask(alice, { title: 'Old task' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderApp(`/tasks/${task.id}`);
    await heading('Old task');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await heading('My tasks')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Old task".');
    expect(api.taskTitles(alice)).toEqual([]);
  });

  test('search and filters send query parameters and narrow the list', async () => {
    api.addTask(alice, { title: 'Pay rent', priority: 'high' });
    api.addTask(alice, { title: 'Call mum', description: 'about the rent', status: 'done' });
    api.addTask(alice, { title: 'Walk the dog' });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByText('Walk the dog');

    await user.type(screen.getByLabelText('Search'), 'rent');
    await screen.findByText('Pay rent');
    await waitFor(() => { expect(screen.queryByText('Walk the dog')).not.toBeInTheDocument(); });
    expect(screen.getByText('2 tasks found')).toBeInTheDocument();
    expect(api.requests.at(-1)?.query.get('search')).toBe('rent');

    await user.selectOptions(screen.getByLabelText('Status'), 'done');
    await waitFor(() => { expect(screen.queryByText('Pay rent')).not.toBeInTheDocument(); });
    expect(screen.getByText('Call mum')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    expect(await screen.findByText('No tasks match your search or filters.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Sort by'), 'priority');
    await user.selectOptions(screen.getByLabelText('Order'), 'asc');
    await waitFor(() => {
      const last = api.requests.at(-1)?.query;
      expect(last?.get('sort')).toBe('priority');
      expect(last?.get('order')).toBe('asc');
      expect(last?.get('status')).toBe('in_progress');
      expect(last?.get('search')).toBe('rent');
    });
  });

  test('more than one page of tasks shows working pagination', async () => {
    for (let i = 1; i <= 12; i++) api.addTask(alice, { title: `Task ${i}` });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByText('Task 12');
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Task 2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(api.requests.at(-1)?.query.get('offset')).toBe('10');
  });
});
