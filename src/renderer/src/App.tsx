import { useEffect, useMemo, useRef, useState } from 'react'
import { INBOX_ID, type AppData, type Task } from '@shared/types'
import { isOverdue } from '@shared/time'
import { compareTasks, inSmartView, matchesQuery, SMART_VIEWS, type DuePreset, type View } from './views'
import { Sidebar } from './components/Sidebar'
import { QuickAdd } from './components/QuickAdd'
import { TaskRow } from './components/TaskRow'
import { TaskDetail } from './components/TaskDetail'
import { SettingsModal } from './components/SettingsModal'
import { AlertIcon, BellIcon, PencilIcon, SearchIcon, SettingsIcon, TrashIcon, XIcon } from './components/Icons'

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const EMPTY: Record<string, { title: string; text: string }> = {
  today: { title: 'Nothing due today', text: 'Enjoy the free time, or add something above.' },
  upcoming: { title: 'Nothing coming up', text: 'Tasks with a future due date show here.' },
  overdue: { title: "You're all caught up", text: 'No overdue tasks. Nice work!' },
  all: { title: 'No open tasks', text: 'Add your first task above.' },
  completed: { title: 'No completed tasks yet', text: 'Finished tasks show here.' },
  list: { title: 'This list is empty', text: 'Add a task above.' },
  search: { title: 'No matches', text: 'Try a different search.' }
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [view, setView] = useState<View>({ kind: 'smart', id: 'today' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [now, setNow] = useState(Date.now())

  const addRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.getState().then(setData)
    const offState = window.api.onState(setData)
    const offNav = window.api.onNavigate((nav) => {
      setQuery('')
      setView({ kind: 'smart', id: 'overdue' })
      setSelectedId(nav.view === 'task' ? nav.taskId : null)
    })
    // Keep "overdue" labels and counts fresh.
    const tick = setInterval(() => setNow(Date.now()), 15_000)
    return () => {
      offState()
      offNav()
      clearInterval(tick)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const typing = e.target instanceof HTMLElement && e.target.matches('input, textarea, select')
      if ((e.ctrlKey && e.key.toLowerCase() === 'n') || (!typing && e.key.toLowerCase() === 'n')) {
        e.preventDefault()
        addRef.current?.focus()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && !typing) {
        if (showSettings) setShowSettings(false)
        else setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSettings])

  const listsById = useMemo(() => new Map(data?.lists.map((l) => [l.id, l]) ?? []), [data])

  // Fall back to Today if the open list was deleted.
  useEffect(() => {
    if (data && view.kind === 'list' && !listsById.has(view.id)) setView({ kind: 'smart', id: 'today' })
  }, [data, view, listsById])

  if (!data) return <div className="loading" />

  const searching = query.trim().length > 0
  const currentList = view.kind === 'list' ? listsById.get(view.id) : undefined

  let open: Task[]
  let done: Task[] = []
  if (searching) {
    open = data.tasks.filter((t) => matchesQuery(t, query)).sort((a, b) => Number(a.done) - Number(b.done) || compareTasks(a, b))
  } else if (view.kind === 'smart') {
    open = data.tasks.filter((t) => inSmartView(t, view.id, now)).sort(compareTasks)
  } else {
    const inList = data.tasks.filter((t) => t.listId === view.id)
    open = inList.filter((t) => !t.done).sort(compareTasks)
    done = inList.filter((t) => t.done).sort(compareTasks)
  }

  const overdueCount = data.tasks.filter((t) => isOverdue(t, now)).length
  const selected = data.tasks.find((t) => t.id === selectedId) ?? null

  const title = searching
    ? `Search: “${query.trim()}”`
    : view.kind === 'smart'
      ? SMART_VIEWS.find((v) => v.id === view.id)!.label
      : (currentList?.name ?? '')
  const subtitle =
    view.kind === 'smart' && view.id === 'today' && !searching
      ? new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      : `${open.length} task${open.length === 1 ? '' : 's'}`

  const defaultPreset: DuePreset =
    view.kind === 'smart' && view.id === 'today' ? 'today' : view.kind === 'smart' && view.id === 'upcoming' ? 'tomorrow' : 'none'

  async function toggle(t: Task): Promise<void> {
    await window.api.updateTask(t.id, { done: !t.done })
    if (!t.done) {
      setToast({
        id: Date.now(),
        text: `Completed “${t.title}”`,
        action: { label: 'Undo', run: () => window.api.updateTask(t.id, { done: false }) }
      })
    }
  }

  async function remove(t: Task): Promise<void> {
    const removed = await window.api.deleteTask(t.id)
    if (selectedId === t.id) setSelectedId(null)
    if (removed) {
      setToast({ id: Date.now(), text: 'Task deleted', action: { label: 'Undo', run: () => window.api.restoreTask(removed) } })
    }
  }

  async function sendReminder(): Promise<void> {
    const n = await window.api.sendOverdueReminder()
    setToast({
      id: Date.now(),
      text: n ? `Reminder sent for ${n} overdue task${n === 1 ? '' : 's'}` : 'No overdue tasks — nothing to remind'
    })
  }

  async function deleteCurrentList(): Promise<void> {
    if (!currentList) return
    const count = data!.tasks.filter((t) => t.listId === currentList.id).length
    const msg = count ? `Delete “${currentList.name}” and its ${count} task${count === 1 ? '' : 's'}?` : `Delete “${currentList.name}”?`
    if (!confirm(msg)) return
    await window.api.deleteList(currentList.id)
    setView({ kind: 'smart', id: 'today' })
  }

  function select(v: View): void {
    setView(v)
    setQuery('')
    setSelectedId(null)
    setShowDone(false)
  }

  const rows = (tasks: Task[]) =>
    tasks.map((t) => (
      <TaskRow
        key={t.id}
        task={t}
        list={listsById.get(t.listId)}
        showList={view.kind !== 'list' || searching}
        selected={t.id === selectedId}
        now={now}
        onSelect={() => setSelectedId(t.id === selectedId ? null : t.id)}
        onToggle={() => toggle(t)}
        onDelete={() => remove(t)}
      />
    ))

  const empty = EMPTY[searching ? 'search' : view.kind === 'list' ? 'list' : view.id]
  const showQuickAdd = !searching && !(view.kind === 'smart' && view.id === 'completed')

  return (
    <div className="app">
      <Sidebar data={data} view={view} now={now} onSelect={select} onOpenSettings={() => setShowSettings(true)} />

      <main className="main">
        <header className="header">
          <div className="header-title">
            {currentList && renaming === currentList.id ? (
              <input
                className="title-input"
                autoFocus
                defaultValue={currentList.name}
                onBlur={(e) => {
                  window.api.renameList(currentList.id, e.target.value)
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <h1>
                {currentList && <span className="dot lg" style={{ background: currentList.color }} />}
                {title}
              </h1>
            )}
            <p className="muted">{subtitle}</p>
          </div>

          <div className="header-actions">
            {currentList && currentList.id !== INBOX_ID && !searching && (
              <>
                <button className="icon-btn ghost" title="Rename list" onClick={() => setRenaming(currentList.id)}>
                  <PencilIcon width={16} height={16} />
                </button>
                <button className="icon-btn ghost danger" title="Delete list" onClick={deleteCurrentList}>
                  <TrashIcon width={16} height={16} />
                </button>
              </>
            )}
            <div className="search">
              <SearchIcon width={16} height={16} />
              <input ref={searchRef} placeholder="Search  (Ctrl+F)" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button className="icon-btn ghost xs" aria-label="Clear search" onClick={() => setQuery('')}>
                  <XIcon width={14} height={14} />
                </button>
              )}
            </div>
            <button
              className={`btn ${overdueCount ? 'danger' : ''}`}
              title="Show a desktop notification for every overdue task now"
              onClick={sendReminder}
            >
              <BellIcon width={16} height={16} />
              Send overdue reminder
              {overdueCount > 0 && <span className="badge">{overdueCount}</span>}
            </button>
            <button className="icon-btn ghost" title="Settings" onClick={() => setShowSettings(true)}>
              <SettingsIcon width={18} height={18} />
            </button>
          </div>
        </header>

        <div className="content">
          {overdueCount > 0 && !(view.kind === 'smart' && view.id === 'overdue') && !searching && (
            <div className="banner">
              <AlertIcon width={18} height={18} />
              <span>
                <strong>
                  {overdueCount} task{overdueCount === 1 ? ' is' : 's are'} overdue.
                </strong>{' '}
                Don't forget to finish {overdueCount === 1 ? 'it' : 'them'}.
              </span>
              <button className="btn sm danger" onClick={() => select({ kind: 'smart', id: 'overdue' })}>
                Review
              </button>
            </div>
          )}

          {showQuickAdd && (
            <QuickAdd
              key={view.kind + view.id}
              ref={addRef}
              lists={data.lists}
              defaultListId={view.kind === 'list' ? view.id : INBOX_ID}
              defaultPreset={defaultPreset}
            />
          )}

          {view.kind === 'smart' && view.id === 'completed' && open.length > 0 && !searching && (
            <div className="row end">
              <button className="btn sm" onClick={() => window.api.clearCompleted()}>
                <TrashIcon width={14} height={14} /> Clear completed
              </button>
            </div>
          )}

          <div className="task-list">{rows(open)}</div>

          {open.length === 0 && done.length === 0 && (
            <div className="empty">
              <div className="empty-art">✓</div>
              <h3>{empty.title}</h3>
              <p className="muted">{empty.text}</p>
            </div>
          )}

          {done.length > 0 && (
            <>
              <button className="section-toggle" onClick={() => setShowDone(!showDone)}>
                <span className={`caret ${showDone ? 'open' : ''}`}>▸</span> Completed ({done.length})
              </button>
              {showDone && <div className="task-list">{rows(done)}</div>}
            </>
          )}
        </div>
      </main>

      {selected && (
        <TaskDetail
          key={selected.id}
          task={selected}
          lists={data.lists}
          now={now}
          onClose={() => setSelectedId(null)}
          onDelete={() => remove(selected)}
        />
      )}

      {showSettings && (
        <SettingsModal settings={data.settings} onClose={() => setShowSettings(false)} onTestReminder={sendReminder} />
      )}

      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action!.run()
                setToast(null)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="icon-btn ghost xs" aria-label="Dismiss" onClick={() => setToast(null)}>
            <XIcon width={14} height={14} />
          </button>
        </div>
      )}
    </div>
  )
}
