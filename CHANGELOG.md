# Changelog

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Update button: the app looks for a newer release once a day and shows
  an **Update to …** button in the top bar when there is one. Pressing it
  downloads the file that matches the platform and the way the app was
  installed, verifies it against the release's `SHA256SUMS` and installs
  it: AppImage, portable folders and the web edition are replaced in
  place and restarted, Windows installers and the macOS disk image are
  opened, `.deb`/`.rpm` packages are downloaded with the command to
  install them. Nothing is downloaded before the button is pressed.
- **Settings › General › Check for updates** switches the daily check off;
  **Status** shows the result of the last check and has **Check now**.
- Portable archives contain a `portable.txt` marker, and
  `untisd -version` of the web edition names the archive it came from.

## [1.0.0] - 2026-10-21

First release.

### Added

- Desktop app for Windows, macOS and Linux (Tauri) and a web edition
  (`untisd -web`) that runs in the browser on every platform Go supports,
  including FreeBSD, OpenBSD, NetBSD and DragonFly BSD.
- Go backend that drives the `untis` CLI, with a built-in, fully fictional
  sample school so the app works without an account.
- Dashboard with configurable widgets: now & next, agenda, upcoming
  changes, week stats, exams, homework, absences, messages, next break and
  recent notifications.
- Timetable by week or day with a period or true-time scale, parallel
  groups, merged double lessons, a current-time line, holidays and lesson
  details.
- Exams, homework, absences, messages and holidays views; local "done" and
  "read" marks.
- Change notifications (in-app and desktop) per change type, with quiet
  hours and grouping.
- Subject names, colours, emoji, hiding and only/except filters.
- Theme engine: modes, palettes, presets, accent and state colours, four
  state styles, fonts, density, radius, custom CSS.
- English and German; first day of week, 12/24 h clock, date format,
  relative dates.
- Command palette (Ctrl/Cmd+K) and rebindable keyboard shortcuts,
  including two-key sequences.
- 127 settings in 20 sections, with search, import, export and reset.

[1.0.0]: https://github.com/seesee010/webuntis-frontend/releases/tag/v1.0.0
