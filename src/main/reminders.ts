import { Notification, powerMonitor } from 'electron'
import type { Navigate, Task } from '@shared/types'
import { formatDue, isOverdue, nextReminderAt, relative } from '@shared/time'
import type { Store } from './store'

const MAX_WAIT = 60_000

/**
 * Watches tasks and shows a Windows notification when one becomes overdue,
 * then repeats every `settings.repeatMinutes` until it's done or snoozed.
 */
export class ReminderService {
  private timer: NodeJS.Timeout | null = null
  // Notifications must stay referenced or their click handlers get garbage collected.
  private live = new Set<Notification>()

  constructor(
    private store: Store,
    private icon: string,
    private onOpen: (nav: Navigate) => void,
    /** Called when Windows refuses to show the notification (e.g. notifications turned off). */
    private onBlocked: (nav: Navigate) => void
  ) {}

  start(): void {
    this.store.on('change', () => this.schedule())
    // Timers don't fire while the PC sleeps, so check as soon as it wakes.
    powerMonitor.on('resume', () => this.check())
    powerMonitor.on('unlock-screen', () => this.check())
    this.check()
  }

  overdue(now = Date.now()): Task[] {
    return this.store.data.tasks
      .filter((t) => isOverdue(t, now))
      .sort((a, b) => a.dueAt! - b.dueAt!)
  }

  /** Manual "send overdue reminder": notifies every overdue task, ignoring snooze. */
  sendNow(): number {
    const tasks = this.overdue()
    if (tasks.length) {
      this.notify(tasks)
      this.store.markReminded(tasks.map((t) => t.id))
    }
    return tasks.length
  }

  private check(): void {
    const now = Date.now()
    const { repeatMinutes } = this.store.data.settings
    const due = this.store.data.tasks.filter((t) => {
      const at = nextReminderAt(t, repeatMinutes)
      return at !== null && at <= now
    })
    if (due.length) {
      this.notify(due.sort((a, b) => a.dueAt! - b.dueAt!))
      this.store.markReminded(due.map((t) => t.id), now) // emits change -> schedule()
    } else {
      this.schedule()
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    const { repeatMinutes } = this.store.data.settings
    const now = Date.now()
    let next = Infinity
    for (const t of this.store.data.tasks) {
      const at = nextReminderAt(t, repeatMinutes)
      if (at !== null && at < next) next = at
    }
    // Cap the wait so clock changes or missed timers never delay a reminder long.
    const wait = Math.min(Math.max(next - now, 500), MAX_WAIT)
    this.timer = setTimeout(() => this.check(), wait)
  }

  private notify(tasks: Task[]): void {
    const single = tasks.length === 1
    const nav: Navigate = single ? { view: 'task', taskId: tasks[0].id } : { view: 'overdue' }
    if (!Notification.isSupported()) return this.onBlocked(nav)
    const lists = new Map(this.store.data.lists.map((l) => [l.id, l.name]))

    const title = single ? `Overdue: ${tasks[0].title}` : `You have ${tasks.length} overdue tasks`
    const body = single
      ? `Was due ${formatDue(tasks[0].dueAt!)} (${relative(tasks[0].dueAt!)}) · ${lists.get(tasks[0].listId) ?? 'Inbox'}`
      : tasks
          .slice(0, 4)
          .map((t) => `• ${t.title} — ${relative(t.dueAt!)}`)
          .join('\n') + (tasks.length > 4 ? `\n+ ${tasks.length - 4} more` : '')

    const n = new Notification({
      title,
      body,
      icon: this.icon,
      urgency: 'critical',
      timeoutType: 'never' // stay on screen until dismissed
    })
    n.on('click', () => {
      this.live.delete(n)
      this.onOpen(nav)
    })
    n.on('close', () => this.live.delete(n))
    n.on('failed', (_e, error) => {
      console.warn('Reminder notification failed:', error)
      this.live.delete(n)
      this.onBlocked(nav)
    })
    this.live.add(n)
    n.show()
  }
}
