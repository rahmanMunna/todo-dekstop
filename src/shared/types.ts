export type Priority = 0 | 1 | 2 | 3 // none, low, medium, high

export interface Task {
  id: string
  listId: string
  title: string
  notes: string
  priority: Priority
  /** Epoch ms. Null means no due date (never reminded). */
  dueAt: number | null
  done: boolean
  completedAt: number | null
  createdAt: number
  updatedAt: number
  /** Reminders are paused until this time. */
  snoozedUntil: number | null
  /** When the last overdue notification for this task was shown. */
  lastRemindedAt: number | null
}

export interface TodoList {
  id: string
  name: string
  color: string
  createdAt: number
}

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  /** Re-remind overdue tasks every N minutes. 0 = remind once. */
  repeatMinutes: number
  launchAtStartup: boolean
  closeToTray: boolean
  theme: Theme
  trayHintShown: boolean
}

export interface AppData {
  version: 1
  lists: TodoList[]
  tasks: Task[]
  settings: Settings
}

export type NewTask = Pick<Task, 'title'> & Partial<Pick<Task, 'listId' | 'notes' | 'priority' | 'dueAt'>>
export type TaskPatch = Partial<Pick<Task, 'title' | 'notes' | 'priority' | 'dueAt' | 'listId' | 'done'>>

export type Navigate = { view: 'overdue' } | { view: 'task'; taskId: string }

export const INBOX_ID = 'inbox'

export interface TodoApi {
  getState(): Promise<AppData>
  onState(cb: (data: AppData) => void): () => void
  onNavigate(cb: (nav: Navigate) => void): () => void
  createTask(input: NewTask): Promise<Task>
  updateTask(id: string, patch: TaskPatch): Promise<void>
  deleteTask(id: string): Promise<Task | null>
  restoreTask(task: Task): Promise<void>
  snoozeTask(id: string, until: number): Promise<void>
  clearCompleted(): Promise<void>
  createList(name: string, color: string): Promise<TodoList>
  renameList(id: string, name: string): Promise<void>
  deleteList(id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  /** Shows a notification for every overdue task now. Returns how many were overdue. */
  sendOverdueReminder(): Promise<number>
}
