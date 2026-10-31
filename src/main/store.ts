import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  INBOX_ID,
  type AppData,
  type NewTask,
  type Settings,
  type Task,
  type TaskPatch,
  type TodoList
} from '@shared/types'

const defaultSettings: Settings = {
  repeatMinutes: 60,
  launchAtStartup: false,
  closeToTray: true,
  theme: 'system',
  trayHintShown: false
}

function defaults(): AppData {
  return {
    version: 1,
    lists: [{ id: INBOX_ID, name: 'Inbox', color: '#6366f1', createdAt: Date.now() }],
    tasks: [],
    settings: { ...defaultSettings }
  }
}

/**
 * Owns all app data. Persists to a JSON file in the user data folder with
 * atomic writes, and emits 'change' after every mutation.
 */
export class Store extends EventEmitter {
  private file = path.join(app.getPath('userData'), 'todo-data.json')
  data: AppData = defaults()

  load(): void {
    if (!fs.existsSync(this.file)) return this.save()
    try {
      // Strip a BOM in case the file was hand-edited (e.g. by Notepad/PowerShell).
      const text = fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '')
      const raw = JSON.parse(text) as Partial<AppData>
      const base = defaults()
      this.data = {
        version: 1,
        lists: raw.lists?.length ? raw.lists : base.lists,
        tasks: raw.tasks ?? [],
        settings: { ...base.settings, ...raw.settings }
      }
      if (!this.data.lists.some((l) => l.id === INBOX_ID)) this.data.lists.unshift(base.lists[0])
    } catch (err) {
      // Keep the unreadable file for recovery instead of overwriting it.
      const backup = `${this.file}.corrupt-${Date.now()}`
      fs.copyFileSync(this.file, backup)
      console.error(`Could not read ${this.file}, backed up to ${backup}`, err)
      this.data = defaults()
      this.save()
    }
  }

  private save(): void {
    const json = JSON.stringify(this.data, null, 2)
    const tmp = `${this.file}.tmp`
    try {
      fs.writeFileSync(tmp, json)
      fs.renameSync(tmp, this.file)
    } catch {
      // Rename can fail on Windows if the file is briefly locked (e.g. antivirus).
      fs.writeFileSync(this.file, json)
    }
  }

  private commit(): void {
    this.save()
    this.emit('change', this.data)
  }

  private task(id: string): Task | undefined {
    return this.data.tasks.find((t) => t.id === id)
  }

  createTask(input: NewTask): Task {
    const now = Date.now()
    const listId = this.data.lists.some((l) => l.id === input.listId) ? input.listId! : INBOX_ID
    const dueAt = input.dueAt ?? null
    const task: Task = {
      id: randomUUID(),
      listId,
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
    this.data.tasks.push(task)
    this.commit()
    return task
  }

  updateTask(id: string, patch: TaskPatch): void {
    const t = this.task(id)
    if (!t) return
    const now = Date.now()
    if (patch.title !== undefined) t.title = patch.title.trim() || t.title
    if (patch.notes !== undefined) t.notes = patch.notes
    if (patch.priority !== undefined) t.priority = patch.priority
    if (patch.listId !== undefined && this.data.lists.some((l) => l.id === patch.listId)) t.listId = patch.listId
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
    this.commit()
  }

  deleteTask(id: string): Task | null {
    const i = this.data.tasks.findIndex((t) => t.id === id)
    if (i === -1) return null
    const [removed] = this.data.tasks.splice(i, 1)
    this.commit()
    return removed
  }

  restoreTask(task: Task): void {
    if (this.task(task.id)) return
    if (!this.data.lists.some((l) => l.id === task.listId)) task.listId = INBOX_ID
    this.data.tasks.push(task)
    this.commit()
  }

  snoozeTask(id: string, until: number): void {
    const t = this.task(id)
    if (!t) return
    t.snoozedUntil = until
    t.updatedAt = Date.now()
    this.commit()
  }

  markReminded(ids: string[], at = Date.now()): void {
    for (const id of ids) {
      const t = this.task(id)
      if (t) t.lastRemindedAt = at
    }
    this.commit()
  }

  clearCompleted(): void {
    this.data.tasks = this.data.tasks.filter((t) => !t.done)
    this.commit()
  }

  createList(name: string, color: string): TodoList {
    const list: TodoList = { id: randomUUID(), name: name.trim() || 'Untitled', color, createdAt: Date.now() }
    this.data.lists.push(list)
    this.commit()
    return list
  }

  renameList(id: string, name: string): void {
    const list = this.data.lists.find((l) => l.id === id)
    if (!list || !name.trim()) return
    list.name = name.trim()
    this.commit()
  }

  /** Deletes the list and every task in it. The Inbox can't be deleted. */
  deleteList(id: string): void {
    if (id === INBOX_ID) return
    this.data.lists = this.data.lists.filter((l) => l.id !== id)
    this.data.tasks = this.data.tasks.filter((t) => t.listId !== id)
    this.commit()
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch }
    this.commit()
  }
}
