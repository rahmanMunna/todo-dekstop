import type { Task } from '@shared/types'
import { endOfDay, HOUR, isOverdue, startOfDay, DAY } from '@shared/time'

export type SmartView = 'today' | 'upcoming' | 'overdue' | 'all' | 'completed'
export type View = { kind: 'smart'; id: SmartView } | { kind: 'list'; id: string }

export const SMART_VIEWS: { id: SmartView; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'all', label: 'All tasks' },
  { id: 'completed', label: 'Completed' }
]

export function inSmartView(t: Task, id: SmartView, now: number): boolean {
  switch (id) {
    case 'today':
      return !t.done && t.dueAt !== null && t.dueAt <= endOfDay(now)
    case 'upcoming':
      return !t.done && t.dueAt !== null && t.dueAt > endOfDay(now)
    case 'overdue':
      return isOverdue(t, now)
    case 'all':
      return !t.done
    case 'completed':
      return t.done
  }
}

/** Overdue first, then by due date (undated last), then priority, then newest. */
export function compareTasks(a: Task, b: Task): number {
  if (a.done && b.done) return (b.completedAt ?? 0) - (a.completedAt ?? 0)
  const ad = a.dueAt ?? Infinity
  const bd = b.dueAt ?? Infinity
  if (ad !== bd) return ad - bd
  if (a.priority !== b.priority) return b.priority - a.priority
  return b.createdAt - a.createdAt
}

export function matchesQuery(t: Task, q: string): boolean {
  const s = q.trim().toLowerCase()
  return !s || t.title.toLowerCase().includes(s) || t.notes.toLowerCase().includes(s)
}

// ---- Due date presets ----

export type DuePreset = 'none' | 'hour' | 'today' | 'tomorrow' | 'custom'

export function presetTime(p: DuePreset, now = Date.now()): number | null {
  switch (p) {
    case 'hour':
      return roundToMinutes(now + HOUR, 5)
    case 'today': {
      const sixPm = startOfDay(now) + 18 * HOUR
      // Late in the day, "today" means a couple of hours from now.
      return now < sixPm - HOUR ? sixPm : Math.min(roundToMinutes(now + 2 * HOUR, 30), endOfDay(now))
    }
    case 'tomorrow':
      return startOfDay(now) + DAY + 9 * HOUR
    default:
      return null
  }
}

function roundToMinutes(ts: number, m: number): number {
  const step = m * 60_000
  return Math.ceil(ts / step) * step
}

/** epoch ms <-> value for <input type="datetime-local"> */
export function toInputValue(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromInputValue(v: string): number | null {
  if (!v) return null
  const ts = new Date(v).getTime()
  return Number.isNaN(ts) ? null : ts
}

export const LIST_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16']
