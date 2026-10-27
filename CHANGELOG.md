# Changelog

All notable changes to this project are documented here.

## 1.0.0 — 2026-10-27

Initial public release.

- Desktop notifications for DeepSeek Harness event lifecycle:
  - turn completed / error / blocked / max-tokens / aborted;
  - `ask_user_question` input requests and tool approval requests;
  - goal completed / blocked;
  - subagent and workflow completion (optional).
- Windows backend: PowerShell + WinRT Toast, DSH Desktop AUMID
  `DeepSeekHarness.Notify`, click-to-focus through the `dsh://open` deep link.
- Ubuntu backend: `gdbus`/`notify-send` notifications, `paplay`/`pw-play`/`aplay`
  sounds, clickable notifications through `ActionInvoked` + `wmctrl`/`xdotool`.
- macOS best-effort backend: `osascript` + `afplay`, click support via
  `terminal-notifier`.
- Four notification styles with a dedicated privacy mode.
- Configurable events, sounds, delivery mode, quiet hours, minimum duration,
  cooldown, content fields and custom icon.
- Optional agent tool `send_desktop_notification`.
- Bilingual settings page (Chinese/English) under Settings → System
  Notifications, backed by same-origin host routes.
- Bundled original chime/alert WAV files and SVG/PNG artwork.
- 39 unit tests plus cross-platform CI (Ubuntu + Windows, Node 20/22).
