import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle schema for the local SQLite database (session history).
 * `drizzle-kit generate` produces SQL migrations from this file; the runtime
 * applies the equivalent DDL in `client.ts` so the app never depends on the
 * migration folder being shipped.
 */

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  runtime: text('runtime').notNull().default('windows'),
  wslDistro: text('wsl_distro'),
  lastOpenedAt: integer('last_opened_at').notNull(),
  createdAt: integer('created_at').notNull(),
  expanded: integer('expanded', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Folder colour in the sidebar and explorer. */
  color: text('color'),
  /** JSON: the project's sub-folders (`ProjectFolder[]`). */
  folders: text('folders', { mode: 'json' }),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  status: text('status').notNull(),
  usage: text('usage', { mode: 'json' }).notNull(),
  runtimeMs: integer('runtime_ms').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  dirtyFiles: integer('dirty_files').notNull().default(0),
  providerSessionId: text('provider_session_id'),
  costUsd: real('cost_usd').notNull().default(0),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(),
  timestamp: integer('timestamp').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  tags: text('tags', { mode: 'json' }).notNull().default('[]'),
  projectId: text('project_id'),
  folderId: text('folder_id'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  kind: text('kind').notNull().default('text'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const terminals = sqliteTable('terminals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  shellId: text('shell_id').notNull(),
  cwd: text('cwd').notNull().default(''),
  program: text('program', { mode: 'json' }),
  projectId: text('project_id'),
  folderId: text('folder_id'),
  createdAt: integer('created_at').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const DDL = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, runtime TEXT NOT NULL DEFAULT 'windows',
    wsl_distro TEXT, last_opened_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
    expanded INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, color TEXT, folders TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, provider_id TEXT NOT NULL, model TEXT NOT NULL,
    status TEXT NOT NULL, usage TEXT NOT NULL, runtime_ms INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    dirty_files INTEGER NOT NULL DEFAULT 0, provider_session_id TEXT, cost_usd REAL NOT NULL DEFAULT 0, worktree TEXT, extra TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
    project_id TEXT, pinned INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'text',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, folder_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS terminals (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, shell_id TEXT NOT NULL, cwd TEXT NOT NULL DEFAULT '', program TEXT,
    project_id TEXT, created_at INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, folder_id TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, updated_at)`,
];

/**
 * Column additions for databases created by earlier builds. Each is applied
 * once; SQLite reports "duplicate column" afterwards, which the client ignores.
 */
export const MIGRATIONS = [
  `ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'`,
  `ALTER TABLE projects ADD COLUMN color TEXT`,
  `ALTER TABLE sessions ADD COLUMN worktree TEXT`,
  `ALTER TABLE sessions ADD COLUMN extra TEXT`,
  `ALTER TABLE projects ADD COLUMN folders TEXT`,
  `ALTER TABLE terminals ADD COLUMN folder_id TEXT`,
  `ALTER TABLE notes ADD COLUMN folder_id TEXT`,
];
