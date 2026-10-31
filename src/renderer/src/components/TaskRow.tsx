import type { Task, TodoList } from '@shared/types'
import { endOfDay, formatDue, isOverdue, relative } from '@shared/time'
import { CheckIcon, ClockIcon, FlagIcon, NoteIcon, TrashIcon } from './Icons'

interface Props {
  task: Task
  list?: TodoList
  showList: boolean
  selected: boolean
  now: number
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
}

export const PRIORITY_LABEL = ['None', 'Low', 'Medium', 'High'] as const

export function TaskRow({ task, list, showList, selected, now, onSelect, onToggle, onDelete }: Props) {
  const overdue = isOverdue(task, now)
  const dueClass = overdue ? 'overdue' : task.dueAt !== null && task.dueAt <= endOfDay(now) ? 'today' : ''

  return (
    <div className={`task ${selected ? 'selected' : ''} ${task.done ? 'done' : ''} ${overdue ? 'is-overdue' : ''}`} onClick={onSelect}>
      <button
        className={`check p${task.priority}`}
        aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {task.done && <CheckIcon width={12} height={12} strokeWidth={3} />}
      </button>

      <div className="task-body">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {task.dueAt !== null && (
            <span className={`due ${dueClass}`} title={new Date(task.dueAt).toLocaleString()}>
              <ClockIcon width={12} height={12} />
              {formatDue(task.dueAt, now)}
              {overdue && <> · {relative(task.dueAt, now)}</>}
            </span>
          )}
          {task.priority > 0 && (
            <span className={`prio p${task.priority}`}>
              <FlagIcon width={12} height={12} />
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {task.notes && <NoteIcon width={12} height={12} className="muted" />}
          {showList && list && (
            <span className="list-tag">
              <span className="dot sm" style={{ background: list.color }} />
              {list.name}
            </span>
          )}
        </div>
      </div>

      <button
        className="icon-btn ghost row-action"
        aria-label="Delete task"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <TrashIcon width={16} height={16} />
      </button>
    </div>
  )
}
