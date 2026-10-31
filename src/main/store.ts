import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  INBOX_ID,
  type AppData,
  type NewTask,
  type Priority,
  type Settings,
  type Task,
  type TaskPatch,
  type TodoList
} from '@shared/types'
import { openDatabase, transaction } from './db'

const defaultSettings: Settings = {
  repeatMinutes: 60,
  launchAtStartup: false,
  closeToTray: true,
  theme: 'system',
  trayHintShown: false
}

const INBOX: TodoList = { id: INBOX_ID, name: 'Inbox', color: '#6366f1', createdAt: 0 }

type Row = Record<string, unknown>

const toTask = (r: Row): Task => ({
  id: r.id as string,
  listId: r.list_id as string,
  title: r.title as string,
  notes: r.notes as string,
  priority: r.priority as Priority,
  dueAt: r.due_at as number | null,
  done: r.done === 1,
  completedAt: r.completed_at as number | null,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
  snoozedUntil: r.snoozed_until as number | null,
  lastRemindedAt: r.last_reminded_at as number | null
})

const toList = (r: Row): TodoList => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as string,
  createdAt: r.created_at as number
})

/**
 * Owns all app data. SQLite (todo.db in the user data folder) is the source of
 * truth; `data` is an in-memory snapshot of it for the UI and reminders,
 * refreshed after every write. Emits 'change' after every mutation.
 */
export class Store extends EventEmitter {
  private dir = app.getPath('userData')
  private db!: DatabaseSync
  data: AppData = { version: 1, lists: [], tasks: [], settings: { ...defaultSettings } }

  load(): void {
    this.db = openDatabase(path.join(this.dir, 'todo.db'))
    this.importLegacyJson()
    this.db.prepare('INSERT OR IGNORE INTO lists (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
      INBOX.id,
      INBOX.name,
      INBOX.color,
      Date.now()
    )
    this.refresh()
  }

  close(): void {
    this.db?.close()
  }

  /** Re-reads everything from the database into the `data` snapshot. */
  private refresh(): void {
    const lists = this.db.prepare('SELECT * FROM lists ORDER BY created_at').all().map(toList)
    // Inbox always first.
    lists.sort((a, b) => Number(b.id === INBOX_ID) - Number(a.id === INBOX_ID))
    const tasks = this.db.prepare('SELECT * FROM tasks').all().map(toTask)
    const settings = { ...defaultSettings }
    for (const r of this.db.prepare('SELECT key, value FROM settings').all()) {
      const key = r.key as string
      if (key in settings) Object.assign(settings, { [key]: JSON.parse(r.value as string) })
    }
    this.data = { version: 1, lists, tasks, settings }
  }

  private commit(): void {
    this.refresh()
    this.emit('change', this.data)
  }

  private task(id: string): Task | undefined {
    return this.data.tasks.find((t) => t.id === id)
  }

  private listExists(id: string | undefined): boolean {
    return id !== undefined && this.data.lists.some((l) => l.id === id)
  }

  /** Inserts or fully overwrites a task row. */
  private writeTask(t: Task): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tasks
           (id, list_id, title, notes, priority, due_at, done, completed_at,
            created_at, updated_at, snoozed_until, last_reminded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        t.id,
        t.listId,
        t.title,
        t.notes,
        t.priority,
        t.dueAt,
        t.done ? 1 : 0,
        t.completedAt,
        t.createdAt,
        t.updatedAt,
        t.snoozedUntil,
        t.lastRemindedAt
      )
  }

  createTask(input: NewTask): Task {
    const now = Date.now()
    const dueAt = input.dueAt ?? null
    const task: Task = {
      id: randomUUID(),
      listId: this.listExists(input.listId) ? input.listId! : INBOX_ID,
      title: input.title.trim(),
      notes: input.notes ?? '',
      priority: input.priority ?? 0,
      dueAt,
      done: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      snoozedUntil: null,
      // A task created already overdue doesn't need an instant notification;
      // the repeat interval will still remind about it later.
      lastRemindedAt: dueAt !== null && dueAt <= now ? now : null
    }
    this.writeTask(task)
    this.commit()
    return task
  }

  updateTask(id: string, patch: TaskPatch): void {
    const current = this.task(id)
    if (!current) return
    const t = { ...current }
    const now = Date.now()
    if (patch.title !== undefined) t.title = patch.title.trim() || t.title
    if (patch.notes !== undefined) t.notes = patch.notes
    if (patch.priority !== undefined) t.priority = patch.priority
    if (this.listExists(patch.listId)) t.listId = patch.listId!
    if (patch.dueAt !== undefined && patch.dueAt !== t.dueAt) {
      t.dueAt = patch.dueAt
      t.snoozedUntil = null
      t.lastRemindedAt = patch.dueAt !== null && patch.dueAt <= now ? now : null
    }
    if (patch.done !== undefined && patch.done !== t.done) {
      t.done = patch.done
      t.completedAt = patch.done ? now : null
    }
    t.updatedAt = now
    this.writeTask(t)
    this.commit()
  }

  deleteTask(id: string): Task | null {
    const removed = this.task(id) ?? null
    if (!removed) return null
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    this.commit()
    return removed
  }

  restoreTask(task: Task): void {
    if (this.task(task.id)) return
    this.writeTask({ ...task, listId: this.listExists(task.listId) ? task.listId : INBOX_ID })
    this.commit()
  }

  snoozeTask(id: string, until: number): void {
    this.db.prepare('UPDATE tasks SET snoozed_until = ?, updated_at = ? WHERE id = ?').run(until, Date.now(), id)
    this.commit()
  }

  markReminded(ids: string[], at = Date.now()): void {
    const stmt = this.db.prepare('UPDATE tasks SET last_reminded_at = ? WHERE id = ?')
    transaction(this.db, () => ids.forEach((id) => stmt.run(at, id)))
    this.commit()
  }

  clearCompleted(): void {
    this.db.exec('DELETE FROM tasks WHERE done = 1')
    this.commit()
  }

  createList(name: string, color: string): TodoList {
    const list: TodoList = { id: randomUUID(), name: name.trim() || 'Untitled', color, createdAt: Date.now() }
    this.db.prepare('INSERT INTO lists (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
      list.id,
      list.name,
      list.color,
      list.createdAt
    )
    this.commit()
    return list
  }

  renameList(id: string, name: string): void {
    if (!name.trim()) return
    this.db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(name.trim(), id)
    this.commit()
  }

  /** Deletes the list and (via ON DELETE CASCADE) every task in it. The Inbox can't be deleted. */
  deleteList(id: string): void {
    if (id === INBOX_ID) return
    this.db.prepare('DELETE FROM lists WHERE id = ?').run(id)
    this.commit()
  }

  updateSettings(patch: Partial<Settings>): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    transaction(this.db, () => {
      for (const [key, value] of Object.entries(patch)) {
        if (key in defaultSettings && value !== undefined) stmt.run(key, JSON.stringify(value))
      }
    })
    this.commit()
  }

  /**
   * One-time import from the JSON file used by versions before 0.3.0.
   * The old file is renamed (not deleted) so it remains as a backup.
   */
  private importLegacyJson(): void {
    const file = path.join(this.dir, 'todo-data.json')
    if (!fs.existsSync(file)) return
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM lists').get() as { n: number }
    if (n > 0) return // already have data; never import twice

    let legacy: Partial<AppData>
    try {
      legacy = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
    } catch (err) {
      console.error(`Could not read legacy ${file}; skipping import`, err)
      return
    }

    const insertList = this.db.prepare('INSERT OR IGNORE INTO lists (id, name, color, created_at) VALUES (?, ?, ?, ?)')
    const insertSetting = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    transaction(this.db, () => {
      for (const l of legacy.lists ?? []) insertList.run(l.id, l.name, l.color, l.createdAt)
      insertList.run(INBOX.id, INBOX.name, INBOX.color, Date.now())
      const listIds = new Set([INBOX_ID, ...(legacy.lists ?? []).map((l) => l.id)])
      for (const t of legacy.tasks ?? []) this.writeTask({ ...t, listId: listIds.has(t.listId) ? t.listId : INBOX_ID })
      for (const [key, value] of Object.entries(legacy.settings ?? {})) {
        if (key in defaultSettings) insertSetting.run(key, JSON.stringify(value))
      }
    })
    fs.renameSync(file, `${file}.imported-backup`)
    console.log(`Imported ${legacy.tasks?.length ?? 0} tasks from ${file} into SQLite`)
  }
}
