import type { Task } from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const isOverdue = (t: Task, now = Date.now()): boolean =>
  !t.done && t.dueAt !== null && t.dueAt <= now

export function startOfDay(ts = Date.now()): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const endOfDay = (ts = Date.now()): number => startOfDay(ts) + DAY - 1

/** "in 5 min", "3 h ago", "2 days ago" */
export function relative(ts: number, now = Date.now()): string {
  const diff = ts - now
  const abs = Math.abs(diff)
  let text: string
  if (abs < MIN) return diff >= 0 ? 'now' : 'just now'
  if (abs < HOUR) text = `${Math.round(abs / MIN)} min`
  else if (abs < DAY) text = `${Math.round(abs / HOUR)} h`
  else {
    const days = Math.round(abs / DAY)
    text = `${days} day${days === 1 ? '' : 's'}`
  }
  return diff >= 0 ? `in ${text}` : `${text} ago`
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** "Today 6:00 PM", "Tomorrow 9:00 AM", "Mon, Nov 3 9:00 AM" */
export function formatDue(ts: number, now = Date.now()): string {
  const day = startOfDay(ts)
  const today = startOfDay(now)
  const time = timeFmt.format(ts)
  if (day === today) return `Today ${time}`
  if (day === today + DAY) return `Tomorrow ${time}`
  if (day === today - DAY) return `Yesterday ${time}`
  return `${dateFmt.format(ts)} ${time}`
}

/** When the next overdue notification for a task should fire, or null if never. */
export function nextReminderAt(t: Task, repeatMinutes: number): number | null {
  if (t.done || t.dueAt === null) return null
  let next = Math.max(t.dueAt, t.snoozedUntil ?? 0)
  if (t.lastRemindedAt !== null && t.lastRemindedAt >= next) {
    if (repeatMinutes <= 0) return null
    next = t.lastRemindedAt + repeatMinutes * MIN
  }
  return next
}

export { MIN, HOUR, DAY }
