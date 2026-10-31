import { forwardRef, useState } from 'react'
import type { Priority, TodoList } from '@shared/types'
import { formatDue } from '@shared/time'
import { fromInputValue, presetTime, toInputValue, type DuePreset } from '../views'
import { PlusIcon } from './Icons'

interface Props {
  lists: TodoList[]
  defaultListId: string
  defaultPreset: DuePreset
}

const PRESETS: { id: DuePreset; label: string }[] = [
  { id: 'none', label: 'No date' },
  { id: 'hour', label: 'In 1 hour' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'custom', label: 'Pick…' }
]

export const QuickAdd = forwardRef<HTMLInputElement, Props>(function QuickAdd(
  { lists, defaultListId, defaultPreset },
  ref
) {
  const [title, setTitle] = useState('')
  const [preset, setPreset] = useState<DuePreset>(defaultPreset)
  const [custom, setCustom] = useState('')
  const [priority, setPriority] = useState<Priority>(0)
  const [listId, setListId] = useState(defaultListId)
  const [focused, setFocused] = useState(false)

  // Reset defaults when the user switches view (the parent keys this by view).
  const dueAt = preset === 'custom' ? fromInputValue(custom) : presetTime(preset)
  const expanded = focused || title.length > 0

  async function submit(): Promise<void> {
    if (!title.trim()) return
    await window.api.createTask({ title, dueAt, priority, listId })
    setTitle('')
    setPriority(0)
  }

  return (
    <div
      className={`quick-add ${expanded ? 'expanded' : ''}`}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
      }}
    >
      <div className="quick-add-row">
        <PlusIcon className="quick-add-icon" />
        <input
          ref={ref}
          value={title}
          placeholder="Add a task…  (press N)"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
        />
        {expanded && (
          <button className="btn primary sm" disabled={!title.trim()} onClick={submit}>
            Add
          </button>
        )}
      </div>

      {expanded && (
        <div className="quick-add-tools">
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`chip ${preset === p.id ? 'selected' : ''}`}
                onClick={() => {
                  setPreset(p.id)
                  if (p.id === 'custom' && !custom) setCustom(toInputValue(presetTime('hour')!))
                }}
              >
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <input type="datetime-local" className="input sm" value={custom} onChange={(e) => setCustom(e.target.value)} />
            )}
            {dueAt !== null && preset !== 'custom' && <span className="hint">{formatDue(dueAt)}</span>}
          </div>
          <div className="tool-selects">
            <select className="input sm" value={priority} onChange={(e) => setPriority(Number(e.target.value) as Priority)}>
              <option value={0}>No priority</option>
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
            </select>
            <select className="input sm" value={listId} onChange={(e) => setListId(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
})
