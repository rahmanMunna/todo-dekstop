import type { Settings, Theme } from '@shared/types'
import { APP_NAME, AUTHOR, COPYRIGHT, LICENSE } from '@shared/about'
import { XIcon } from './Icons'

interface Props {
  settings: Settings
  onClose: () => void
  onTestReminder: () => void
}

const REPEAT_OPTIONS = [
  { value: 0, label: 'Remind once' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 240, label: 'Every 4 hours' }
]

export function SettingsModal({ settings, onClose, onTestReminder }: Props) {
  const set = (patch: Partial<Settings>): Promise<void> => window.api.updateSettings(patch)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn ghost" aria-label="Close" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <section>
          <h3>Overdue reminders</h3>
          <div className="setting">
            <div>
              <div className="setting-label">Repeat reminders</div>
              <div className="setting-desc">
                How often to remind you again while a task stays overdue. If Windows notifications are turned off,
                Todo pops its window up instead.
              </div>
            </div>
            <select className="input" value={settings.repeatMinutes} onChange={(e) => set({ repeatMinutes: Number(e.target.value) })}>
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="setting">
            <div>
              <div className="setting-label">Test notifications</div>
              <div className="setting-desc">Sends a reminder now for every overdue task.</div>
            </div>
            <button className="btn" onClick={onTestReminder}>
              Send now
            </button>
          </div>
        </section>

        <section>
          <h3>Behavior</h3>
          <Toggle
            label="Keep running in tray when closed"
            desc="Required for reminders to arrive while the window is closed."
            checked={settings.closeToTray}
            onChange={(v) => set({ closeToTray: v })}
          />
          <Toggle
            label="Start with Windows"
            desc="Starts minimized to the tray. Works in the installed app."
            checked={settings.launchAtStartup}
            onChange={(v) => set({ launchAtStartup: v })}
          />
        </section>

        <section>
          <h3>Appearance</h3>
          <div className="setting">
            <div className="setting-label">Theme</div>
            <div className="segmented">
              {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                <button key={t} className={settings.theme === t ? 'selected' : ''} onClick={() => set({ theme: t })}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="about">
          <h3>About</h3>
          <div className="about-card">
            <span className="brand-mark lg">✓</span>
            <div>
              <div className="setting-label">
                {APP_NAME} <span className="muted">v{__APP_VERSION__}</span>
              </div>
              <div className="setting-desc">
                Developed by <strong className="author">{AUTHOR}</strong>
              </div>
              <div className="setting-desc">
                {COPYRIGHT} · {LICENSE}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting clickable">
      <div>
        <div className="setting-label">{label}</div>
        <div className="setting-desc">{desc}</div>
      </div>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
