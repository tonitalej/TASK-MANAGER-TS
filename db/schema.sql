-- Task Management: schema (PostgreSQL 13+ / Supabase)
-- Run order: schema.sql -> seed.sql

BEGIN;

-- ============ RESET (dev only) ============
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS set_updated_at();


-- ============ HELPER FUNCTION ============
-- DEFAULT now() only runs on INSERT, so a trigger keeps updated_at fresh on UPDATE.
CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============ USERS ============
CREATE TABLE users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT         NOT NULL,   -- bcrypt hash, never the password
    role          TEXT         NOT NULL DEFAULT 'user',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT users_email_unique    UNIQUE (email),
    CONSTRAINT users_name_valid      CHECK (char_length(trim(name)) >= 2),
    CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
    CONSTRAINT users_email_format    CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT users_role_valid      CHECK (role IN ('user', 'admin'))
);


-- ============ TASKS ============
CREATE TABLE tasks (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,                     -- optional
    status       TEXT         NOT NULL DEFAULT 'todo',
    priority     TEXT         NOT NULL DEFAULT 'medium',
    due_date     DATE,                     -- optional
    completed_at TIMESTAMPTZ,              -- only set when status = 'done'
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT tasks_title_valid     CHECK (char_length(trim(title)) >= 1),
    CONSTRAINT tasks_status_valid    CHECK (status IN ('todo', 'in_progress', 'done')),
    CONSTRAINT tasks_priority_valid  CHECK (priority IN ('low', 'medium', 'high')),
    CONSTRAINT tasks_completed_valid CHECK (status = 'done' OR completed_at IS NULL)
);


-- ============ INDEXES ============
-- PK and UNIQUE are indexed automatically. Foreign keys are not.

-- GET /api/tasks: WHERE user_id = $1 ORDER BY created_at DESC
CREATE INDEX idx_tasks_user_created ON tasks (user_id, created_at DESC);

-- Filter by status: WHERE user_id = $1 AND status = $2
CREATE INDEX idx_tasks_user_status  ON tasks (user_id, status);

-- "What's due soon?" (partial: only open tasks with a due date)
CREATE INDEX idx_tasks_user_due_open ON tasks (user_id, due_date)
    WHERE status <> 'done' AND due_date IS NOT NULL;


-- ============ TRIGGERS ============
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
