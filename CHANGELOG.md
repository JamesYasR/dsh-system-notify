# Changelog

All notable changes to this project are documented here.

## 1.1.0 — 2026-10-27

Interactive notifications and custom sound files.

- **Approve / reject from the notification**: approval requests now carry
  `Approve` / `Reject` buttons; the outcome is returned to DSH directly.
- **Answer questions from the notification**: single-choice options become
  buttons; overflow and multi-select questions open a picker dialog; `Other…`
  opens a text input. Unsupported shapes fall back to the Chat UI.
- **20 s interaction window** (configurable 5–300 s); timeout or `Open DSH`
  delegates back to the normal Chat prompt.
- Windows uses a per-user `dsh-system-notify://` protocol handler
  (`lib/responder.ps1`) to post actions to a loopback `/respond` route; Linux
  uses freedesktop `ActionInvoked` + zenity dialogs.
- Per-event **custom sound files** with upload from the settings page
  (WAV on Windows; WAV/OGG on Ubuntu), stored under the plugin config
  directory; legacy `sound.customPath` is still honoured.
- New settings: interactive toggle/timeout, per-event custom sound paths and
  upload buttons.
- 64 unit tests.

## 1.0.0 — 2026-10-27

Initial public release.

- Desktop notifications for DeepSeek Harness event lifecycle:
  - turn completed / error / blocked / max-tokens / aborted;
  - `ask_user_question` input requests and tool approval requests;
  - goal completed / blocked;
  - subagent and workflow completion (optional).
- Windows backend: PowerShell + WinRT Toast, DSH Desktop AUMID
  `com.deepseek.dsh`, click-to-focus through the `dsh://open` deep link.
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
- 47 unit tests plus cross-platform CI (Ubuntu + Windows, Node 20/22).
