import { useEffect, useState } from 'react'
import type { Priority, Task, TodoList } from '@shared/types'
import { DAY, formatDue, HOUR, isOverdue, MIN, relative, startOfDay } from '@shared/time'
import { fromInputValue, presetTime, toInputValue } from '../views'
import { AlertIcon, BellIcon, CheckIcon, TrashIcon, XIcon } from './Icons'
import { PRIORITY_LABEL } from './TaskRow'

interface Props {
  task: Task
  lists: TodoList[]
  now: number
  onClose: () => void
  onDelete: () => void
}

export function TaskDetail({ task, lists, now, onClose, onDelete }: Props) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)

  // Re-sync drafts when a different task is opened or it changes elsewhere.
  useEffect(() => setTitle(task.title), [task.id, task.title])
  useEffect(() => setNotes(task.notes), [task.id, task.notes])

  const update = (patch: Parameters<typeof window.api.updateTask>[1]): Promise<void> => window.api.updateTask(task.id, patch)
  const snooze = (until: number): Promise<void> => window.api.snoozeTask(task.id, until)

  const overdue = isOverdue(task, now)
  const snoozed = task.snoozedUntil !== null && task.snoozedUntil > now

  return (
    <aside className="detail">
      <div className="detail-head">
        <button
          className={`check lg p${task.priority}`}
          aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
          onClick={() => update({ done: !task.done })}
        >
          {task.done && <CheckIcon width={14} height={14} strokeWidth={3} />}
        </button>
        <textarea
          className={`detail-title ${task.done ? 'done' : ''}`}
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
          onBlur={() => title.trim() && title !== task.title && update({ title })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
        />
        <button className="icon-btn ghost" aria-label="Close" onClick={onClose}>
          <XIcon />
        </button>
      </div>

      {overdue && (
        <div className="overdue-box">
          <div className="overdue-box-title">
            <AlertIcon width={16} height={16} /> Overdue {relative(task.dueAt!, now).replace(' ago', '')}
          </div>
          {snoozed ? (
            <p>Reminders snoozed until {formatDue(task.snoozedUntil!, now)}.</p>
          ) : (
            <p>You'll keep getting reminders until it's done or snoozed.</p>
          )}
          <div className="row wrap">
            <button className="btn primary sm" onClick={() => update({ done: true })}>
              <CheckIcon width={14} height={14} /> Mark done
            </button>
            <button className="btn sm" onClick={() => snooze(now + 15 * MIN)}>
              Snooze 15m
            </button>
            <button className="btn sm" onClick={() => snooze(now + HOUR)}>
              1 hour
            </button>
            <button className="btn sm" onClick={() => snooze(startOfDay(now) + DAY + 9 * HOUR)}>
              Tomorrow 9 AM
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label>
          <BellIcon width={14} height={14} /> Due &amp; reminder
        </label>
        <div className="row">
          <input
            type="datetime-local"
            className="input"
            value={task.dueAt !== null ? toInputValue(task.dueAt) : ''}
            onChange={(e) => update({ dueAt: fromInputValue(e.target.value) })}
          />
          {task.dueAt !== null && (
            <button className="btn sm" onClick={() => update({ dueAt: null })}>
              Clear
            </button>
          )}
        </div>
        <div className="chips">
          <button className="chip" onClick={() => update({ dueAt: presetTime('hour') })}>
            In 1 hour
          </button>
          <button className="chip" onClick={() => update({ dueAt: presetTime('today') })}>
            Today
          </button>
          <button className="chip" onClick={() => update({ dueAt: presetTime('tomorrow') })}>
            Tomorrow
          </button>
        </div>
      </div>

      <div className="field">
        <label>Priority</label>
        <div className="segmented">
          {([0, 1, 2, 3] as Priority[]).map((p) => (
            <button key={p} className={`${task.priority === p ? 'selected' : ''} p${p}`} onClick={() => update({ priority: p })}>
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>List</label>
        <select className="input" value={task.listId} onChange={(e) => update({ listId: e.target.value })}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field grow">
        <label>Notes</label>
        <textarea
          className="input notes"
          placeholder="Add details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== task.notes && update({ notes })}
        />
      </div>

      <div className="detail-foot">
        <span className="muted">
          {task.done && task.completedAt ? `Completed ${formatDue(task.completedAt, now)}` : `Created ${formatDue(task.createdAt, now)}`}
        </span>
        <button className="icon-btn ghost danger" aria-label="Delete task" onClick={onDelete}>
          <TrashIcon width={16} height={16} />
        </button>
      </div>
    </aside>
  )
}
