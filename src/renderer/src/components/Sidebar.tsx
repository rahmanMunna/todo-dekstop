import { useState, type ReactNode } from 'react'
import type { AppData } from '@shared/types'
import { INBOX_ID } from '@shared/types'
import { AUTHOR } from '@shared/about'
import { inSmartView, LIST_COLORS, SMART_VIEWS, type SmartView, type View } from '../views'
import { AlertIcon, CalendarIcon, CheckCircleIcon, InboxIcon, PlusIcon, SettingsIcon, SunIcon } from './Icons'

const SMART_ICONS: Record<SmartView, ReactNode> = {
  today: <SunIcon />,
  upcoming: <CalendarIcon />,
  overdue: <AlertIcon />,
  all: <InboxIcon />,
  completed: <CheckCircleIcon />
}

interface Props {
  data: AppData
  view: View
  now: number
  onSelect: (v: View) => void
  onOpenSettings: () => void
}

export function Sidebar({ data, view, now, onSelect, onOpenSettings }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const count = (id: SmartView): number => data.tasks.filter((t) => inSmartView(t, id, now)).length
  const listCount = (id: string): number => data.tasks.filter((t) => t.listId === id && !t.done).length

  async function addList(): Promise<void> {
    const trimmed = name.trim()
    setAdding(false)
    setName('')
    if (!trimmed) return
    const color = LIST_COLORS[data.lists.length % LIST_COLORS.length]
    const list = await window.api.createList(trimmed, color)
    onSelect({ kind: 'list', id: list.id })
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">✓</span> Todo
      </div>

      <nav className="nav">
        {SMART_VIEWS.map((v) => {
          const n = v.id === 'completed' ? 0 : count(v.id)
          const active = view.kind === 'smart' && view.id === v.id
          return (
            <button
              key={v.id}
              className={`nav-item ${active ? 'active' : ''} ${v.id === 'overdue' && n ? 'has-overdue' : ''}`}
              onClick={() => onSelect({ kind: 'smart', id: v.id })}
            >
              {SMART_ICONS[v.id]}
              <span className="nav-label">{v.label}</span>
              {n > 0 && <span className={`count ${v.id === 'overdue' ? 'danger' : ''}`}>{n}</span>}
            </button>
          )
        })}
      </nav>

      <div className="nav-section">Lists</div>
      <nav className="nav lists">
        {data.lists.map((l) => {
          const active = view.kind === 'list' && view.id === l.id
          const n = listCount(l.id)
          return (
            <button key={l.id} className={`nav-item ${active ? 'active' : ''}`} onClick={() => onSelect({ kind: 'list', id: l.id })}>
              {l.id === INBOX_ID ? <InboxIcon /> : <span className="dot" style={{ background: l.color }} />}
              <span className="nav-label">{l.name}</span>
              {n > 0 && <span className="count">{n}</span>}
            </button>
          )
        })}
        {adding ? (
          <input
            className="nav-input"
            autoFocus
            placeholder="List name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={addList}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addList()
              if (e.key === 'Escape') {
                setName('')
                setAdding(false)
              }
            }}
          />
        ) : (
          <button className="nav-item subtle" onClick={() => setAdding(true)}>
            <PlusIcon />
            <span className="nav-label">New list</span>
          </button>
        )}
      </nav>

      <div className="sidebar-footer">
        <button className="nav-item subtle" onClick={onOpenSettings}>
          <SettingsIcon />
          <span className="nav-label">Settings</span>
        </button>
        <div className="credit">by {AUTHOR}</div>
      </div>
    </aside>
  )
}
