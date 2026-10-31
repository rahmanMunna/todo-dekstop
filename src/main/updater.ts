import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

const CHECK_EVERY = 4 * 60 * 60_000 // 4 hours

/**
 * Checks GitHub Releases for a newer version, downloads it in the background,
 * and installs it on the next quit (or right away via install()).
 */
export class UpdateService {
  status: UpdateStatus = app.isPackaged ? { state: 'idle' } : { state: 'dev' }

  constructor(
    private icon: string,
    private onStatus: (s: UpdateStatus) => void,
    private beforeInstall: () => void
  ) {}

  start(): void {
    if (!app.isPackaged) return // updates only apply to the installed app

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'up-to-date' }))
    autoUpdater.on('update-available', (info) => this.set({ state: 'downloading', version: info.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) =>
      this.set({ state: 'downloading', version: this.status.version, percent: Math.round(p.percent) })
    )
    autoUpdater.on('update-downloaded', (info) => {
      this.set({ state: 'ready', version: info.version })
      if (Notification.isSupported()) {
        const n = new Notification({
          title: `Todo ${info.version} is ready`,
          body: 'Click to restart and update now, or it will install next time Todo quits.',
          icon: this.icon
        })
        n.on('click', () => this.install())
        n.show()
      }
    })
    autoUpdater.on('error', (err) => this.set({ state: 'error', error: err.message }))

    // Wait a bit after launch so startup stays snappy.
    setTimeout(() => this.check(), 10_000)
    setInterval(() => this.check(), CHECK_EVERY)
  }

  check(): void {
    if (!app.isPackaged || this.status.state === 'downloading' || this.status.state === 'ready') return
    autoUpdater.checkForUpdates().catch((err: Error) => this.set({ state: 'error', error: err.message }))
  }

  install(): void {
    if (this.status.state !== 'ready') return
    this.beforeInstall()
    // isSilent = true (no installer UI), isForceRunAfter = true (reopen Todo afterwards)
    autoUpdater.quitAndInstall(true, true)
  }

  private set(s: UpdateStatus): void {
    this.status = s
    this.onStatus(s)
  }
}
