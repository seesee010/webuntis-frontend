# webuntis-frontend

![Made With:Agentic_Engineering](https://img.shields.io/badge/made%20with-Agentic_Engineering-red?style=plastic)
[![CI](https://github.com/seesee010/webuntis-frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/seesee010/webuntis-frontend/actions/workflows/ci.yml)
![Go](https://img.shields.io/badge/backend-Go-00ADD8?logo=go&logoColor=white)
![TypeScript](https://img.shields.io/badge/frontend-TypeScript-3178C6?logo=typescript&logoColor=white)
![Tauri](https://img.shields.io/badge/desktop-Tauri%202-24C8DB?logo=tauri&logoColor=white)

A modular desktop app for your WebUntis timetable, built on top of the
[`untis`](https://github.com/seesee010/webuntis-scraper) command line tool.

The app never talks to WebUntis itself. Login, sessions, caching and every
API call stay in the `untis` CLI; this app runs it, turns its JSON into a
clean model and gives you a GUI with far more knobs than the WebUntis web
interface: 127 settings in 20 sections, a rebindable shortcut for every
command, and per-subject names, colours and emoji.

> **AI disclosure:** every issue and pull request in this repository opened by the user
> [seesee010](https://github.com/seesee010) is fully AI generated, including the code,
> commit messages and descriptions.

## Features

- **Dashboard** with widgets you choose, order and size: now & next (with
  progress and time left), agenda, upcoming changes, week stats, exams,
  homework, absences, messages, the next break and recent notifications
- **Timetable** by week or day, with a period-based or true-time scale,
  parallel groups side by side, merged double lessons, a current-time line,
  holidays and a detail dialog for every lesson
- **Exams, homework, absences, messages and holidays** as list views, with
  countdowns, totals and grouping. Homework can be ticked off and messages
  marked read locally (this never changes WebUntis)
- **Change notifications** for cancellations, substitutions, room changes,
  new exams and more, as in-app messages or desktop notifications, with
  quiet hours and a switch per change type
- **Subjects your way**: rename, recolour, add an emoji, hide, filter with
  only/except, and choose codes, full names or both
- **Theming**: light/dark/system, palettes and presets, accent and per-state
  colours, four ways to draw lesson states, fonts, density, radius and
  custom CSS
- **English and German**, first day of week, 12/24 h clock, date format and
  relative dates
- **Command palette** (Ctrl/Cmd+K) and keyboard shortcuts such as `g t` for
  the timetable, all rebindable
- **Sample data**: a fully fictional school is built in, so the app works
  without any account

## Download

Grab the latest version from the
[releases page](https://github.com/seesee010/webuntis-frontend/releases/latest):

| Platform | Desktop app | Web edition (runs in the browser) |
|---|---|---|
| Windows x64 / ARM64 | `.exe` installer, `.msi`, portable `.zip` | `.zip` (x64, ARM64, x86) |
| macOS (Apple Silicon + Intel) | `.dmg`, `.app` | `.tar.gz` (arm64, amd64) |
| Linux x64 / ARM64 | `.deb`, `.rpm`, `.AppImage`, portable `.tar.gz` | `.tar.gz` (also armv7, armv6, 386, riscv64, ppc64le, s390x, loong64) |
| FreeBSD, OpenBSD, NetBSD, DragonFly | — | `.tar.gz` (amd64, arm64, 386, armv7) |
| illumos, Solaris | — | `.tar.gz` (amd64) |

Which file to pick and how to start it is explained in the
[installation guide](docs/install.md).

## Quick start from source (sample data)

Requirements: Go 1.23+, Node 22+ with pnpm, and Rust plus the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for the
desktop app.

```bash
git clone https://github.com/seesee010/webuntis-frontend
cd webuntis-frontend/desktop && pnpm install && cd ..

make app        # desktop app (builds the backend sidecar first)
```

Or run it in a browser while developing, with two terminals:

```bash
make backend-dev   # untisd on 127.0.0.1:47800 with sample data
make dev           # Vite on http://localhost:1420
```

The app starts with **sample data**: a made-up school, student, teachers
and rooms, generated relative to the current week so that every lesson
state, countdown and notification shows up.

## Using your real timetable

1. Install and set up the CLI once:

   ```bash
   pipx install git+https://github.com/seesee010/webuntis-scraper
   untis init
   ```

2. In the app, open **Settings › Data source** and switch the source to
   **untis CLI**. The executable, transport, cache age (`--max-age`),
   offline mode, `--config`/`--env` paths, extra arguments and the timeout
   are all configurable there.

**Status** shows the CLI version, the last refresh and any error. Errors
from the CLI (missing setup, rejected login, WebUntis unreachable) show up
as a banner with a hint on what to do.

## How it works

```
┌──────────────────────────── desktop app (Tauri) ───────────────────────────┐
│                                                                            │
│  TypeScript frontend  ──HTTP + SSE (loopback, token)──▶  untisd (Go)       │
│  modules: dashboard,                                     service: cache,   │
│  timetable, settings, …                                  refresh, changes  │
│                                                               │            │
└───────────────────────────────────────────────────────────────┼────────────┘
                                                                │ runs
                                                     untis --json - --from … --to …
                                                                │
                                                             WebUntis
```

- `desktop/src-tauri` is a thin Rust shell. It starts the Go backend as a
  sidecar, reads its `{"port", "token"}` handshake line and hands it to the
  frontend.
- `backend/` (`untisd`) serves a small HTTP API on 127.0.0.1 with a
  per-process token. It caches snapshots per date window, refreshes in the
  background, diffs consecutive snapshots into change events and streams
  them to the frontend as server-sent events.
- `desktop/src` is a framework-free TypeScript frontend made of
  **modules**. Each module declares its page, dashboard widgets, settings
  and commands in one place.

See [docs/architecture.md](docs/architecture.md) for the details,
including how to add a module.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl/Cmd+K` | command palette |
| `g d` `g t` `g e` `g h` `g a` `g m` `g b` `g s` | go to dashboard, timetable, exams, homework, absences, messages, holidays (breaks), settings |
| `←` `→` `t` `w` `d` | timetable: previous, next, today, week, day |
| `r` | refresh |
| `Ctrl/Cmd+B` | toggle the sidebar |
| `Ctrl/Cmd+Shift+L` | light/dark |
| `?` | list all shortcuts |

Every shortcut can be changed under **Settings › Keyboard shortcuts**.

## Development

```bash
make test      # Go, TypeScript and Rust tests
make lint      # go vet + tsc
make build     # release bundle
```

Every change comes with tests, and CI must be green before a pull request
is merged. Tests only use made-up data and never run the real `untis` CLI.

| Path | What |
|---|---|
| `backend/cmd/untisd` | backend entry point |
| `backend/internal/domain` | normalised data model |
| `backend/internal/untisjson` | decoding of the CLI's JSON |
| `backend/internal/provider` | data sources: `sample`, `cli` |
| `backend/internal/service` | caching, refresh loop, change events |
| `backend/internal/api` | loopback HTTP API and event stream |
| `backend/internal/settings` | the settings document |
| `desktop/src/core` | frontend runtime: API client, signals, router, settings, i18n, … |
| `desktop/src/modules` | one folder per feature |
| `desktop/src/i18n` | translations |
| `desktop/src-tauri` | desktop shell |

## Privacy

- The backend listens on the loopback interface only and requires a random
  per-process token.
- Settings are stored in `untis-gui/settings.json` in your config folder
  (`~/.config` on Linux) with mode `600`.
  Credentials stay with the `untis` CLI and never pass through this app.
- Screenshots, fixtures and tests use only the built-in fictional data.
