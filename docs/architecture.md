# Architecture

The app has three parts in one repository:

| Part | Language | Role |
|---|---|---|
| `backend/` (`untisd`) | Go | runs the `untis` CLI, caches, refreshes, detects changes, serves an API |
| `desktop/src/` | TypeScript | the user interface, built from modules |
| `desktop/src-tauri/` | Rust | the desktop window; starts `untisd` and connects the two |

## Backend

```
cmd/untisd ──▶ api ──▶ service ──▶ provider ──┬──▶ sample   (fictional data)
                │          │                  └──▶ cli      (runs `untis`)
                │          ├──▶ changes                          │
                │          └──▶ events                      untisjson ──▶ domain
                ├──▶ settings
                └──▶ update ──▶ GitHub releases (only this, only when allowed)
```

- **domain** is the model the frontend sees: one `Lesson` list (with a
  dominant `status` for colouring), the time grid, exams, homework,
  absences, messages and holidays. `Snapshot.Ensure()` guarantees there
  are no JSON nulls.
- **untisjson** decodes `untis --json -`. The CLI emits two timetable
  shapes (REST v1 grid and JSON-RPC) and per-section `{"error": …}`
  objects; both are normalised here.
- **provider** is the data source interface: `Snapshot(window)` and
  `Who(code)`. Errors carry a kind (`config`, `login`, `unreachable`,
  `not-found`, …) so the UI can explain them.
  - **sample** builds a deterministic, fully fictional school relative to
    the current week, with every lesson state in every week.
  - **cli** runs `untis` through a `Runner` interface (tests use a fake)
    and maps the CLI's exit codes onto error kinds.
- **service** owns the active provider, caches snapshots per window,
  coalesces concurrent requests, refreshes an overview window in the
  background, diffs it with **changes** and publishes on **events**. It
  swaps the provider when the data source settings change.
- **settings** stores one JSON document atomically with mode 600. The
  frontend owns its schema; the backend only reads the `backend` subtree.
- **update** looks for newer releases and installs one when the user
  presses the update button; see [Updates](#updates) below.
- **api** serves it on 127.0.0.1 with a per-process token:

| Method | Path | |
|---|---|---|
| GET | `/api/health` | liveness (no token) |
| GET | `/api/status` | provider, refresh times, last error, CLI version |
| GET | `/api/snapshot?from&to[&fresh=1]` | data for a window |
| GET | `/api/overview[?fresh=1]` | the background-refreshed window |
| POST | `/api/refresh` | refetch now; returns the changes |
| GET | `/api/who?code=` | explain a code |
| GET/PUT/PATCH/DELETE | `/api/settings` | read, replace, merge-patch, reset |
| GET | `/api/update` | the updater's state: newer release, progress, result |
| POST | `/api/update/check` | look for a newer release now |
| POST | `/api/update/apply` | the update button: download and install; progress arrives as events |
| POST | `/api/update/page` | open the release page in the browser |
| POST | `/api/update/restart` | web edition: restart into the installed version |
| GET | `/api/events` | server-sent events: `snapshot`, `changes`, `error`, `settings`, `provider`, `update` |

On start `untisd` prints `{"port", "token", "version"}` as its first
line. The Tauri shell reads it and passes it to the frontend
(`backend_info` command). `-dev` fixes port 47800 and token `dev` for
browser development; `-watch-stdin` stops the backend when the shell's
pipe closes.

### Updates

`internal/update` is the only code that talks to anything but the local
machine and the `untis` CLI. It does three things:

1. **Check.** Shortly after start and then once a day it asks
   `api.github.com` for the latest release of this repository, unless
   `updates.check` is switched off. Development builds (`dev`) never ask.
   A failed check is silent. When the release is newer than the running
   version, the state becomes `available` and the frontend shows the
   update button; otherwise there is no button.
2. **Pick the file.** A release carries about 45 files. `Detect` works
   out how the running app was installed, and `Install.Asset` names the
   one file that belongs to it:

   | Installation | Recognised by | File | Button |
   |---|---|---|---|
   | web edition | `-web` and the target stamped into release builds (`untisd -version` shows it) | `untis-web-V-OS-ARCH.tar.gz` / `.zip` | replaces `untisd`, then restarts it |
   | AppImage | `$APPIMAGE`, with the binary inside `$APPDIR` | `Untis_V_amd64.AppImage` / `_aarch64` | replaces the AppImage file, then restarts the app |
   | portable folder | `portable.txt` next to the programs | `Untis_V_x64-linux-portable.tar.gz`, `…-windows-portable.zip` | replaces both programs, then restarts the app |
   | deb / rpm | `dpkg -S` / `rpm -qf` own the binary | `Untis_V_amd64.deb`, `Untis-V-1.x86_64.rpm` | downloads it and shows the install command |
   | Windows setup | `uninstall.exe` next to the app | `Untis_V_x64-setup.exe` | downloads and opens it |
   | Windows MSI | below Program Files, no uninstaller | `Untis_V_x64_en-US.msi` | downloads and opens it |
   | macOS app | inside `*.app/Contents/MacOS` | `Untis_V_universal.dmg` | downloads and opens it |
   | anything else | — | — | opens the release page |

   When the installation is not recognised for certain (a build from
   source, a platform without a file) it counts as unknown: opening the
   release page is always right, downloading the wrong file never is.
   A test pins these names to the files of a real release.
3. **Install, on request only.** Nothing is downloaded before the button
   is pressed. The download address is built from the tag and the file
   name, the file must have the announced size and the SHA-256 listed in
   the release's `SHA256SUMS`, and only then is anything touched.
   Replaced programs are moved aside first and moved back if a later
   step fails. `SHA256SUMS` comes from the same release, so it protects
   against a broken download, not against a compromised release.

The web edition restarts in place on Unix (`exec`), handing its address
and token to the new process through the environment, so the open tab
keeps working; on Windows the user starts it again. The desktop app
restarts through the shell's `restart_app` command.

For testing, `UNTISD_UPDATE_URL` points the updater at another server
that serves `/repos/OWNER/REPO/releases/latest` and
`/OWNER/REPO/releases/download/TAG/FILE`. It must be https, or http on
the loopback interface.

## Frontend

### Core (`desktop/src/core`)

| File | Purpose |
|---|---|
| `api/` | typed client and the TypeScript mirror of the domain model |
| `reactive.ts` | `Signal`, `computed`, and `Scope` (collects cleanups) |
| `bootstrap.ts` | `createApp()` wires all services; shared by the app and the tests |
| `module.ts` | `ModuleDef` and the registry |
| `schema.ts` | declarative settings fields |
| `settings.ts` | settings store: instant local writes, batched merge patches, defaults |
| `data.ts` | overview snapshot, on-demand windows, live updates |
| `update.ts` | the updater's state for the update button and the status page |
| `display.ts` | names, subject overrides, colours and filters — every view uses it |
| `i18n.ts` | translations and every date/time format |
| `commands.ts`, `keys.ts` | commands, bindings, fuzzy matching |
| `widgets.ts` | dashboard widgets and the layout setting |

There is no UI framework. Views build DOM with `h()` and subscribe to
signals through the `Scope` they are given; the shell disposes that scope
when you navigate away, so views cannot leak listeners or timers.

### Modules (`desktop/src/modules`)

A module is one folder that exports a `ModuleDef`. Everything a feature
contributes is declared there:

```ts
export default defineModule({
  id: "exams",
  title: "Exams",                 // English; translated through i18n
  icon: "exam",
  order: 30,                      // position in the sidebar
  route: { path: "/exams", key: "g e", render: renderExams },
  widgets: [/* dashboard widgets */],
  settings: [/* settings sections */],
  commands: [/* palette commands with default shortcuts */],
  setup(ctx) { /* optional start-up hook; may return a cleanup */ },
});
```

| Module | Contributes |
|---|---|
| `general` | start page, last page, sidebar |
| `locale` | language, first day of week, clock, date format, relative dates |
| `datasource` | sample data or `untis` CLI and its options, refresh, overview window |
| `appearance` | theme engine and its settings |
| `subjects` | subject overrides, names, filters |
| `dashboard` | the dashboard page, layout editor and timetable widgets |
| `timetable` | week/day grid, its settings and navigation commands |
| `exams`, `homework`, `absences`, `messages`, `holidays` | list pages and their widgets |
| `settings` | the generated settings page |
| `keyboard` | shortcut handling, command palette, shortcut settings |
| `notifications` | change notifications, history widget |
| `status` | diagnostics page |

### Settings

Settings are data. A module lists sections of typed fields — `toggle`,
`number`, `range`, `select`, `segmented`, `color`, `text`, `list`,
`keybinding`, or `custom` for anything else:

```ts
{ key: "exams.soonDays", type: "number", label: "Highlight exams within",
  default: 3, min: 0, max: 30, unit: "days" }
```

From that the app derives the settings page, search, defaults, reset
buttons, visibility rules (`visibleIf`) and import/export. Reading a value
is `ctx.settings.get("exams.soonDays")`; it falls back to the default.

The whole document is stored by the backend. Besides module settings it
holds `backend.*` (read by `untisd`), `keys.*` (shortcuts) and `state.*`
(GUI-only marks such as homework ticked off).

### Translations

Strings are looked up gettext style: the English text is the key
(`ctx.i18n.t("No upcoming exams.")`). Labels in schemas, commands and
widgets are translated automatically. `src/i18n/catalog.ts` collects
every string the UI can show, and a test fails if one has no German
translation, a translation drops a `{placeholder}`, or the dictionary
has stale entries.

## Adding a module

1. Create `desktop/src/modules/<name>/index.ts` exporting a `ModuleDef`.
2. Add it to the list in `desktop/src/modules/index.ts`.
3. Put pure logic in its own file and test it; render views and widgets
   with the test context (`src/test/ctx.ts`) and the fixtures in
   `src/test/fixtures.ts`.
4. Run `pnpm test` — the translation test lists every new string that
   needs a German translation in `src/i18n/de.ts`.

## Tests

`make test` runs all three suites, and CI runs them on every pull request:

- **Go**: unit tests per package, API tests with `httptest`, and a process
  test that builds `untisd`, reads the handshake and checks that it exits
  with its parent.
- **TypeScript** (Vitest + jsdom): pure logic, every module's view and
  widgets against a real `createApp()` context with a fake API, the
  settings controls, the theme engine and the translation coverage.
- **Rust**: the handshake parser of the desktop shell.

All test data is made up; no test runs the real `untis` CLI.
