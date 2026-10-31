import { app, BrowserWindow, ipcMain, Menu, nativeTheme, Notification, shell, Tray } from 'electron'
import path from 'node:path'
import type { NewTask, Settings, Task, TaskPatch } from '@shared/types'
import icon from '../../resources/icon.png?asset'
import { ReminderService } from './reminders'
import { Store } from './store'
import { UpdateService } from './updater'

const startHidden = process.argv.includes('--hidden')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let store: Store
let reminders: ReminderService
let updater: UpdateService

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(init)
}

function init(): void {
  // Windows needs an AppUserModelID for notifications; in dev it must match the exe.
  app.setAppUserModelId(app.isPackaged ? 'com.rahmanmunna.todo' : process.execPath)
  Menu.setApplicationMenu(null)

  store = new Store()
  store.load()
  applySettings(store.data.settings)

  reminders = new ReminderService(
    store,
    icon,
    (nav) => {
      showWindow()
      win?.webContents.send('navigate', nav)
    },
    // Fallback when Windows notifications are off: surface the window
    // without stealing focus, and flash the taskbar button.
    (nav) => {
      if (!win) return
      if (!win.isVisible() || win.isMinimized()) {
        if (win.isMinimized()) win.restore()
        else win.showInactive()
        win.webContents.send('navigate', nav)
      }
      if (!win.isFocused()) win.flashFrame(true)
    }
  )

  updater = new UpdateService(
    icon,
    (status) => {
      win?.webContents.send('update-status', status)
      updateTray()
    },
    // Let the window actually close instead of hiding to the tray.
    () => {
      quitting = true
    }
  )

  registerIpc()
  createWindow()
  createTray()

  store.on('change', (data) => {
    win?.webContents.send('state', data)
    updateTray()
  })
  reminders.start()
  updater.start()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 780,
    minHeight: 520,
    show: false,
    title: 'Todo',
    icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16161a' : '#f6f6f8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => {
    if (!startHidden) win?.show()
  })
  win.on('focus', () => win?.flashFrame(false))

  win.on('close', (e) => {
    if (quitting || !store.data.settings.closeToTray) return
    e.preventDefault()
    win?.hide()
    if (!store.data.settings.trayHintShown && Notification.isSupported()) {
      new Notification({
        title: 'Todo is still running',
        body: 'It stays in the system tray so it can remind you about overdue tasks.',
        icon
      }).show()
      store.updateSettings({ trayHintShown: true })
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray(): void {
  tray = new Tray(icon)
  tray.on('click', () => showWindow())
  updateTray()
}

function updateTray(): void {
  if (!tray) return
  const count = reminders.overdue().length
  const update = updater.status
  tray.setToolTip(count ? `Todo — ${count} overdue` : 'Todo')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Todo', click: () => showWindow() },
      {
        label: count ? `Send overdue reminder (${count})` : 'No overdue tasks',
        enabled: count > 0,
        click: () => reminders.sendNow()
      },
      { type: 'separator' },
      ...(update.state === 'ready'
        ? [{ label: `Restart to update (v${update.version})`, click: () => updater.install() }]
        : []),
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function applySettings(s: Settings): void {
  nativeTheme.themeSource = s.theme
  // Only register the real installed exe; in dev it would register bare electron.exe.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: s.launchAtStartup, args: ['--hidden'] })
  }
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => store.data)
  ipcMain.handle('task:create', (_e, input: NewTask) => store.createTask(input))
  ipcMain.handle('task:update', (_e, id: string, patch: TaskPatch) => store.updateTask(id, patch))
  ipcMain.handle('task:delete', (_e, id: string) => store.deleteTask(id))
  ipcMain.handle('task:restore', (_e, task: Task) => store.restoreTask(task))
  ipcMain.handle('task:snooze', (_e, id: string, until: number) => store.snoozeTask(id, until))
  ipcMain.handle('task:clearCompleted', () => store.clearCompleted())
  ipcMain.handle('list:create', (_e, name: string, color: string) => store.createList(name, color))
  ipcMain.handle('list:rename', (_e, id: string, name: string) => store.renameList(id, name))
  ipcMain.handle('list:delete', (_e, id: string) => store.deleteList(id))
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    store.updateSettings(patch)
    applySettings(store.data.settings)
  })
  ipcMain.handle('reminder:sendNow', () => reminders.sendNow())
  ipcMain.handle('update:status', () => updater.status)
  ipcMain.handle('update:check', () => updater.check())
  ipcMain.handle('update:install', () => updater.install())
}

app.on('before-quit', () => {
  quitting = true
})

// Keep running in the tray when all windows are closed; reminders live here.
app.on('window-all-closed', () => {
  if (!store?.data.settings.closeToTray) app.quit()
})
