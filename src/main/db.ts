import { DatabaseSync } from 'node:sqlite'

/**
 * Schema migrations, applied in order. The database's `PRAGMA user_version`
 * records how many have run, so each one runs exactly once per install.
 * Never edit a shipped migration; append a new one instead.
 */
const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE lists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE tasks (
    id                TEXT PRIMARY KEY,
    list_id           TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    notes             TEXT NOT NULL DEFAULT '',
    priority          INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    due_at            INTEGER,
    done              INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    completed_at      INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    snoozed_until     INTEGER,
    last_reminded_at  INTEGER
  );

  CREATE INDEX idx_tasks_list ON tasks(list_id);
  CREATE INDEX idx_tasks_open_due ON tasks(done, due_at);

  -- Key/value settings; values are JSON-encoded.
  CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
  `
]

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;    -- fast writes, readers never block
    PRAGMA synchronous = NORMAL;  -- safe with WAL, much faster than FULL
    PRAGMA foreign_keys = ON;     -- enforce list_id -> lists(id)
    PRAGMA busy_timeout = 3000;
  `)
  migrate(db)
  return db
}

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
}

/** Runs fn atomically: either every write in it is saved, or none are. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
