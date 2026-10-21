# Changelog

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/).

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
