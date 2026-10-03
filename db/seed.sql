-- =====================================================================
-- TASK MANAGEMENT — PHASE 1: SEED DATA (development only!)
-- Every seeded user has the password:  Password123!
-- The values below are real bcrypt hashes of that password, so these
-- users will be able to log in once we build Phase 3.
-- Never seed known passwords in production.
-- =====================================================================

BEGIN;

-- Fixed UUIDs so we can reference users in tasks and in later tests.
-- (Normally you let gen_random_uuid() generate them.)
INSERT INTO users (id, name, email, password_hash, role) VALUES
 ('11111111-1111-4111-8111-111111111111', 'Tony',  'tony@example.com',
  '$2b$10$rhfebEzk5BC9w738NwQMiOlyfbtJvkiSn3JkbOBQ3QuwzL4teMPkO', 'user'),
 ('22222222-2222-4222-8222-222222222222', 'Sarah', 'sarah@example.com',
  '$2b$10$DuLfCc3fzw/Rb6GLvMXodO1A1Yk7vN9tOy16lqT/UmuTLsNtHjny.', 'user'),
 ('33333333-3333-4333-8333-333333333333', 'Admin', 'admin@example.com',
  '$2b$10$ROqR4accot53DKUPLZKgUuRTDoIqwU7XZH.ooS1cSU.fKHF0WIJZS', 'admin');

-- Tony's tasks (a mix of statuses, priorities, with/without due dates)
INSERT INTO tasks (user_id, title, description, status, priority, due_date, completed_at, created_at) VALUES
 ('11111111-1111-4111-8111-111111111111', 'Finish SQL Day 9 exercises',
  'Joins, aggregates and subqueries review', 'done', 'high',
  CURRENT_DATE - 1, now() - interval '1 day', now() - interval '5 days'),
 ('11111111-1111-4111-8111-111111111111', 'Design the tasks schema',
  'PK, FK, constraints, indexes', 'in_progress', 'high',
  CURRENT_DATE + 1, NULL, now() - interval '3 days'),
 ('11111111-1111-4111-8111-111111111111', 'Set up Express project',
  NULL, 'todo', 'medium',
  CURRENT_DATE + 3, NULL, now() - interval '2 days'),
 ('11111111-1111-4111-8111-111111111111', 'Read about bcrypt cost factors',
  'Why 10-12 rounds is a common default', 'todo', 'low',
  NULL, NULL, now() - interval '1 day'),
 ('11111111-1111-4111-8111-111111111111', 'Submit coursework to ISSAE-Cnam',
  'Overdue on purpose: useful to test due-date queries', 'todo', 'high',
  CURRENT_DATE - 2, NULL, now() - interval '6 days');

-- Sarah's tasks (needed to test authorization in Phase 5:
-- Tony must NOT be able to read or modify these)
INSERT INTO tasks (user_id, title, description, status, priority, due_date, completed_at, created_at) VALUES
 ('22222222-2222-4222-8222-222222222222', 'Prepare sprint demo',
  'Slides + live walkthrough', 'in_progress', 'high',
  CURRENT_DATE + 2, NULL, now() - interval '4 days'),
 ('22222222-2222-4222-8222-222222222222', 'Review pull requests',
  NULL, 'todo', 'medium',
  CURRENT_DATE, NULL, now() - interval '2 days'),
 ('22222222-2222-4222-8222-222222222222', 'Book dentist appointment',
  NULL, 'done', 'low',
  NULL, now() - interval '3 days', now() - interval '7 days');

COMMIT;
