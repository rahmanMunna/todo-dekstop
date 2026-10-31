# Todo — Desktop Todo App with Overdue Reminders

A clean, fast Windows desktop todo app whose main job is **making sure you never forget a task**. When a task passes its due time and isn't done, Todo reminds you on your desktop, and keeps reminding you until it's done.

**Developed by MD Habibur Rahman Munna.**

---

## Features

### Overdue reminders (the core feature)
- When a task becomes overdue, a Windows notification appears and stays on screen until you dismiss it. Clicking it opens that task.
- If several tasks are overdue at once, you get a single summary notification.
- **Repeats** every hour until the task is done or snoozed. You can change the interval in Settings, from every 15 minutes up to remind once.
- **Snooze** options: 15 minutes, 1 hour, or tomorrow 9 AM.
- The **Send overdue reminder** button (in the app header and the tray menu) sends a reminder immediately.
- **Runs in the system tray** when you close the window, so reminders keep coming.
- Reminders missed while the PC was asleep or the app was closed fire right after wake-up or launch.
- **Backup when notifications are blocked:** if Windows notifications are turned off, Todo pops its own window up on the Overdue view and flashes its taskbar button.

### Task management
- Smart views: **Today, Upcoming, Overdue, All tasks, Completed**
- Custom lists with colors
- Priorities (Low / Medium / High), notes and search
- Quick due-date presets: In 1 hour / Today / Tomorrow / pick a date
- Undo for complete and delete
- Light and dark theme (follows Windows by default)
- Optional **start with Windows**, minimized to the tray
- Keyboard shortcuts: `N` or `Ctrl+N` adds a task, `Ctrl+F` searches, `Esc` closes the side panel

---

## Installation (Windows 10 / 11, 64-bit)

1. Get the installer: **`Todo Setup <version>.exe`**. Build it yourself (see [Development](#development)) or copy it from someone who has.
2. Double-click it.
3. Windows may show **"Windows protected your PC"** because the app isn't code-signed. Click **More info → Run anyway**.
4. Accept the license, choose the install folder, then click **Install** and **Finish**.
5. Open **Todo** from the desktop or the Start menu.

### Recommended after installing
- In Todo, turn on **Settings → Start with Windows** so reminders work after every restart.
- In Windows, turn on **Settings → System → Notifications**, and make sure **Todo** is on in that list.

### Installing on another PC
Copy the same `Todo Setup <version>.exe` to that PC and repeat the steps above. Nothing else is needed: no Node.js and no source code.

### Updating
**Automatic (version 0.2.0 and later):** Todo checks GitHub Releases shortly after it starts and then every 4 hours. It downloads new versions in the background. When an update is ready, you'll see a **Restart now** banner. If you ignore it, the update installs the next time Todo quits. You can also check manually in **Settings → About → Check now**. Your tasks are always kept.

**Manual:** run a newer installer over the existing installation.

### Uninstalling
Windows **Settings → Apps → Installed apps → Todo → Uninstall**. Your tasks file is kept, in case you reinstall.

---

## Your data

| Question | Answer |
|---|---|
| Where are my tasks stored? | In a local **SQLite** database, `%APPDATA%\Todo\todo.db`. Press `Win + R`, paste `%APPDATA%\Todo` and press Enter to open the folder. |
| Do they survive closing the app, restarting the PC, updates or uninstalling? | **Yes.** Every change is committed to the database immediately. |
| Is data shared between PCs? | **No.** Each PC (and each Windows user) has its own separate tasks. There's no account and no cloud. |
| How do I back up or move my tasks? | Quit Todo (tray icon → **Quit**), then copy `todo.db`. To restore, paste it into the same folder on the target PC. This **replaces** that PC's tasks; it doesn't merge them. Only copy it while Todo is fully quit. |
| I used a version before 0.3.0. Where did my data go? | Older versions saved to `todo-data.json`. Version 0.3.0 imports it into `todo.db` automatically on first launch and keeps the old file as `todo-data.json.imported-backup`. |

You can inspect the database with any SQLite viewer, such as [DB Browser for SQLite](https://sqlitebrowser.org/).

---

## Development

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev        # run with hot reload
npm run typecheck  # TypeScript checks
npm run dist       # build the Windows installer into dist/
```

### Publishing an update (auto-update)

Installed copies update themselves from this repo's [GitHub Releases](https://github.com/rahmanMunna/todo-dekstop/releases).

**One-time setup:** create a GitHub token at **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**. Give it access to the `todo-dekstop` repo only, with the **Contents: Read and write** permission.

**Each release:**

1. Bump `"version"` in `package.json`, e.g. `0.2.0` → `0.2.1`. The version must go up, or apps won't see an update.
2. Run:

   ```powershell
   $env:GH_TOKEN = "<your token>"
   npm run release
   ```

This builds the installer and publishes it as a GitHub Release tagged `v<version>`. Every installed Todo picks it up within a few hours, or right away via **Check now**.

`npm run dist` only builds the installer locally and publishes nothing.

> **Troubleshooting:** if Electron starts as plain Node (`Cannot read properties of undefined (reading 'requestSingleInstanceLock')`), your shell has `ELECTRON_RUN_AS_NODE` set. Some editor terminals set it. Clear it with `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) or `unset ELECTRON_RUN_AS_NODE` (bash).

### Tech stack
Electron, React 19, TypeScript, electron-vite, and electron-builder + electron-updater for the installer and auto-updates. Data lives in **SQLite**, using Node's built-in `node:sqlite` module (no native add-on to compile), with WAL mode, foreign keys and versioned migrations.

### Architecture

```
Renderer (React UI)  ──window.api──►  Preload  ──IPC──►  Main process (Node)  ──►  SQLite (todo.db)
        ▲                                                   │
        └──────────── 'state' push after every write ───────┘
```

The main process is the "backend": it owns the database, runs the reminder scheduler and talks to Windows (tray, notifications, startup). The UI can only reach it through the small `window.api` bridge.

### Changing the database schema

Migrations live in `src/main/db.ts` as an ordered list. To change the schema, **append** a new SQL string; never edit one that has already shipped. Each install applies the new migrations once on startup, tracked by `PRAGMA user_version`.

### Code layout

| Path | What it does |
| --- | --- |
| `src/main/index.ts` | Window, tray, IPC, startup and theme settings |
| `src/main/reminders.ts` | Overdue reminder scheduler, notifications and the blocked-notification fallback |
| `src/main/updater.ts` | Auto-update from GitHub Releases |
| `src/main/db.ts` | SQLite connection, schema and migrations |
| `src/main/store.ts` | Data access (queries and writes), plus the one-time JSON import |
| `src/preload/index.ts` | Secure `window.api` bridge to the UI |
| `src/renderer/` | React UI |
| `src/shared/` | Types, date helpers and app/author info used by both sides |
| `scripts/make-icon.mjs` | Generates the app icon |

---

## Author

**MD Habibur Rahman Munna**
GitHub: [@rahmanMunna](https://github.com/rahmanMunna)

## License

Released under the [MIT License](LICENSE).
Copyright © 2026 MD Habibur Rahman Munna.
