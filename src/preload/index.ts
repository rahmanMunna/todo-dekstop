import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppData, Navigate, TodoApi, UpdateStatus } from '@shared/types'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: TodoApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => subscribe<AppData>('state', cb),
  onNavigate: (cb) => subscribe<Navigate>('navigate', cb),
  createTask: (input) => ipcRenderer.invoke('task:create', input),
  updateTask: (id, patch) => ipcRenderer.invoke('task:update', id, patch),
  deleteTask: (id) => ipcRenderer.invoke('task:delete', id),
  restoreTask: (task) => ipcRenderer.invoke('task:restore', task),
  snoozeTask: (id, until) => ipcRenderer.invoke('task:snooze', id, until),
  clearCompleted: () => ipcRenderer.invoke('task:clearCompleted'),
  createList: (name, color) => ipcRenderer.invoke('list:create', name, color),
  renameList: (id, name) => ipcRenderer.invoke('list:rename', id, name),
  deleteList: (id) => ipcRenderer.invoke('list:delete', id),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  sendOverdueReminder: () => ipcRenderer.invoke('reminder:sendNow'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateStatus: (cb) => subscribe<UpdateStatus>('update-status', cb),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install')
}

contextBridge.exposeInMainWorld('api', api)
