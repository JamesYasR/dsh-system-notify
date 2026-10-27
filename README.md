# dsh-system-notify

Codex-style desktop notifications for **DeepSeek Harness**: a toast and a sound when a task finishes, fails, needs your input, or a goal completes — with configurable events, sounds, notification style, privacy level, quiet hours and click-to-focus.

Built for **Windows 10/11** and **Ubuntu 22.04/24.04** (best-effort macOS support).

[![CI](https://github.com/JamesYasR/dsh-system-notify/actions/workflows/ci.yml/badge.svg)](https://github.com/JamesYasR/dsh-system-notify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.2.x-4f6ef7)](https://github.com/deepseek-ai)

---

## Why not just a `notify` script?

Codex only runs a hook when a turn completes. This plugin is event-aware:

| | Codex-style notify script | dsh-system-notify |
|---|---|---|
| Turn complete | ✅ | ✅ with summary, project, duration |
| Turn error | ⚠️ manual scripting | ✅ with error message/code |
| Questions / approvals | ❌ | ✅ “Input needed” / “Approval needed” |
| Goal completed / blocked | ❌ | ✅ |
| Subagent / workflow finished | ❌ | ✅ optional |
| Notification style | ❌ | ✅ privacy / simple / standard / detailed |
| Sound selection | ❌ | ✅ system / chime / alert / custom WAV/OGG |
| Quiet hours & cooldown | ❌ | ✅ |
| Click to focus DSH | ❌ | ✅ configurable |
| Settings UI | ❌ | ✅ Settings → System Notifications |

Everything is local. No network calls, no telemetry, no data leaves the machine.

## Features

- **11 notification events** — turn complete/error/blocked/max-tokens/aborted, input needed, approval needed, goal complete/blocked, subagent finished, workflow finished.
- **Four styles** — privacy (event only), simple, standard, detailed.
- **Sound** — system sound, two bundled original chimes, or your own file; separate normal/error sounds; volume on Ubuntu.
- **Delivery modes** — toast + sound, toast only, or sound only.
- **Quiet hours** — suppress normal notifications overnight, optionally still notify on critical errors.
- **Rate control** — minimum task duration, per-event cooldown, optional subagent-session filtering.
- **Click to focus** — on Windows the toast uses DSH Desktop's official `dsh://open` deep link; on Ubuntu it can focus a window via `wmctrl`/`xdotool`, then falls back to opening a link. The whole click action can be disabled.
- **Agent tool (opt-in)** — `send_desktop_notification` lets the model send an explicit notification when you asked to be pinged.
- **Bilingual UI** — Chinese/English settings page; notification text follows the system locale or can be forced to Chinese/English.
- **Zero runtime dependencies** — Node built-ins and the OS notification stack.

## Notification styles

Given this event:

```text
kind=turnComplete
session=Refactor the settings page
project=D:\workspace\demo
summary="Finished the settings page and verified save / test / sound."
duration=1m 12s
```

| Style | What you see |
|---|---|
| **Privacy** (隐私) | Title only: `Task completed` — no session, summary, path or error details. |
| **Simple** (简洁) | `Task completed` · `Refactor the settings page` |
| **Standard** (标准) | Title + session + summary + `demo · took 1m 12s` |
| **Detailed** (详细) | Title includes session + summary + full path + `turn 3 · took 1m 12s · code …` |

Errors are always delivered with `critical` urgency (Linux) and the error sound; privacy mode still hides the message content.

## Requirements

### Windows

- Windows 10 (1809+) or Windows 11.
- DSH Desktop. The plugin uses:
  - PowerShell 5.1 + WinRT toast APIs (built into Windows);
  - the DSH Desktop AUMID `com.deepseek.dsh` for the toast identity (when it is unavailable the helper falls back to other registered toast sources, ending at PowerShell);
  - the `dsh://open` deep link (registered by DSH Desktop) for click-to-focus.
- Custom notification sounds are played by the PowerShell helper through `System.Media.SoundPlayer`; they must be **PCM WAV**. The two bundled sounds are WAV.
- Toast notifications respect Focus Assist / Do Not Disturb. If you see nothing, check that Windows notification permission for “DeepSeek Harness” is enabled.

### Ubuntu

Install the notification and sound helpers (most desktops have some of them already):

```bash
sudo apt install libnotify-bin libglib2.0-bin pulseaudio-utils wmctrl
```

- `libnotify-bin` provides `notify-send` (fallback when `gdbus` is unavailable).
- `libglib2.0-bin` provides `gdbus` and `dbus-monitor` — **required for clickable notifications**.
- `pulseaudio-utils` provides `paplay` (PipeWire systems usually provide `pw-play`; both are supported).
- `wmctrl` (or `xdotool`) is used to focus the DSH window on click. Without it, clicking falls back to opening the configured link.

Clickable notifications use the standard `org.freedesktop.Notifications` DBus interface: `gdbus` raises the notification with a `default` action, and `dbus-monitor` listens for `ActionInvoked`.

### macOS (best effort)

`osascript` displays notifications and `afplay` plays sounds. Click-to-focus requires [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) (`brew install terminal-notifier`); without it notifications are display-only.

## Install

### From GitHub

```bash
dsh plugin --profile desktop add github:JamesYasR/dsh-system-notify
```

### From a local checkout

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-system-notify
```

Or use the DSH Web UI: **Settings → Plugins → Install** and provide the GitHub spec or the local directory.

After installation open **Settings → System Notifications** (系统通知). The plugin is enabled by default. The settings page shows the detected backends and any missing OS packages.

## Settings reference

The config lives at:

- Windows: `%APPDATA%\dsh-system-notify\config.json`
- Linux/macOS: `$XDG_CONFIG_HOME/dsh-system-notify/config.json` (default `~/.config/dsh-system-notify/config.json`)

Override the location with `DSH_SYSTEM_NOTIFY_CONFIG=/path/to/config.json`.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `events.turnComplete` | `true` | Normal turn completion. |
| `events.turnError` | `true` | Turn ended with an error. |
| `events.turnBlocked` | `true` | Turn blocked (suppressed if a question was just raised). |
| `events.turnMaxTokens` | `true` | Output hit the token limit. |
| `events.turnAborted` | `false` | User cancelled/interrupted. |
| `events.needsInput` | `true` | `ask_user_question` is waiting. |
| `events.approvalRequest` | `true` | A tool waits for approval. |
| `events.goalComplete` | `true` | Long-running goal completed. |
| `events.goalBlocked` | `true` | Long-running goal blocked. |
| `events.subagentComplete` | `false` | A subagent run ended. |
| `events.workflowComplete` | `false` | A workflow run ended. |
| `style` | `standard` | `privacy` / `simple` / `standard` / `detailed`. |
| `language` | `auto` | `auto` / `zh` / `en`. |
| `sound.enabled` | `true` | Play sounds at all. |
| `sound.normal` | `system` | Sound for normal events: `none` / `system` / `chime` / `alert` / `custom`. |
| `sound.error` | `alert` | Sound for error events (same values). |
| `sound.customPath` | `""` | Custom audio file. Windows: WAV. Ubuntu: WAV/OGG. |
| `sound.volume` | `80` | 0–100, Ubuntu only (`paplay`/`pw-play`). |
| `delivery` | `both` | `both` / `toast` / `sound`. |
| `quietHours.enabled` | `false` | Enable the quiet window. |
| `quietHours.start` / `end` | `22:00` / `08:00` | Local time; overnight windows supported. |
| `quietHours.allowCritical` | `true` | Critical events still notify during quiet hours: errors, goal-blocked, and blocking prompts (input/approval). |
| `minDurationSec` | `0` | Only notify for successful turns at least this long. |
| `cooldownSec` | `10` | Minimum gap between same-category notifications. Critical errors bypass it. |
| `include.sessionTitle` | `true` | Show the session title. |
| `include.summary` | `true` | Show the assistant summary / question / error message. |
| `include.workspace` | `true` | Show the project name (standard) or full path (detailed). |
| `include.duration` | `true` | Show elapsed time. |
| `include.sessionId` | `false` | Show the short session id. |
| `summaryMaxChars` | `140` | Summary truncation limit (40–500). |
| `ignoreSubagentSessions` | `true` | Do not notify turn events from subagent sessions. |
| `click.enabled` | `true` | Clicking the toast summons DSH. |
| `click.url` | `dsh://open` | Deep link or URL opened on click. |
| `click.focusWindowTitle` | `DeepSeek Harness` | Ubuntu window-title match for `wmctrl`/`xdotool`. |
| `click.openFallback` | `true` | On Ubuntu, open the link when no window matches. |
| `appName` | `DeepSeek Harness` | App name shown by Linux notifications. |
| `windows.appId` | `com.deepseek.dsh` | Windows toast AUMID; change only for a custom shell build. |
| `iconPath` | `""` | Custom PNG icon; empty uses the bundled icon. |
| `agentTool` | `false` | Register the `send_desktop_notification` tool. |

## Click-to-focus behaviour

### Windows

The toast is created with `activationType="protocol"` and `launch="dsh://open"`, plus an **Open DSH** action button. DSH Desktop registers that protocol and its single-instance handler restores, shows and focuses the primary window. This is the same path DSH itself uses for deep links, so it needs no extra registry keys or helper process from the plugin.

- Turn `click.enabled` off to make the toast non-clickable.
- Running DSH as a web app without Desktop? Set `click.url` to your DSH web URL; the click then opens that URL in the default browser.

### Ubuntu

Clickable notifications cannot be produced by plain `notify-send`, so the plugin uses:

1. `gdbus … Notify` with a `default` action label (“Open DSH”);
2. a short-lived `dbus-monitor` that watches `ActionInvoked` for that notification id;
3. on click, `xdotool` / `wmctrl` focuses a window whose title matches `click.focusWindowTitle`, otherwise `xdg-open <click.url>` (if `click.openFallback`).

If `gdbus` is missing, the plugin falls back to `notify-send`. If `dbus-monitor` is missing, `gdbus` still raises the notification but clicking it cannot be observed, so the toast is not clickable. If you use DSH in a browser on Ubuntu, set `click.focusWindowTitle` to something in the browser window title (e.g. `DeepSeek Harness`) and/or change `click.url` to the DSH URL. On Wayland, `wmctrl`/`xdotool` may be unavailable; the click then falls back to opening `click.url`.

## Event sources

| Notification | DSH source |
|---|---|
| Turn completed / error / blocked / max-tokens / aborted | durable `turn/end` session event with its `reason` |
| Needs input | `user-questions/request` (notified before delegating to the normal answerer) |
| Approval needed | `approval/request` (notified before delegating) |
| Goal completed / blocked | `goal/changed` with operation `complete` / `block` |
| Subagent finished | `subagent/end` |
| Workflow finished | `workflow/end` |
| Custom | agent tool `send_desktop_notification` |

Duplicate suppression: a question suppresses the immediately following `blocked` turn notification (60 s window), and a goal notification suppresses a redundant turn-complete toast (8 s window).

## Privacy

- Notification content stays in process memory (the Windows payload is passed to the PowerShell helper through an environment variable) and in the OS toast. The plugin itself writes only the config file; Windows Notification Center may retain shown toasts according to OS settings.
- The config file is written with user-only permissions where the OS supports them (`0600`).
- **Privacy style** removes session titles, summaries, paths, session ids and error text from the notification. The event category and sound remain.
- Click URLs are validated against an allowlist (`http:`, `https:`, `dsh:`); `file:`, `javascript:`, `ms-msdt:` and other schemes are rejected.
- HTTP routes are same-origin only and reject a mismatched `Origin` header. Request bodies are capped at 256 KiB.

## Troubleshooting

### No toast on Windows

1. Check Windows **Settings → System → Notifications** — “DeepSeek Harness” must be allowed.
2. Check Focus Assist / Do Not Disturb. Toasts are queued in Notification Center rather than shown as banners in some modes.
3. Make sure the plugin is enabled and the event is checked.
4. The default toast AppID is `com.deepseek.dsh`, the AUMID registered by the DSH Desktop Start Menu shortcut. The helper falls back to other registered toast sources, ending at the always-registered PowerShell source. To pin another source, set `windows.appId` explicitly.

### No sound on Windows

- Windows custom audio must be a local **WAV** file. OGG/MP3 will not play.
- Check the Windows volume mixer / output device.
- Use the settings page **Preview sound** button; if it works, the issue is the per-event sound choice.

### No sound on Ubuntu

- Install `pulseaudio-utils` (`paplay`) or make sure `pw-play` exists.
- The bundled system sound is `/usr/share/sounds/freedesktop/stereo/complete.oga`; if that file is absent the plugin falls back to the bundled chime.

### No notifications on Ubuntu

- `notify-send` needs a running notification daemon (GNOME Shell, KDE, dunst, mako…). Headless SSH sessions have none.
- Install `libnotify-bin`; the settings page shows the detected backend.

### Click does not focus DSH

- Windows: DSH Desktop must be installed so the `dsh://` protocol exists. Test by opening `dsh://open` in the Start menu’s Run dialog.
- Ubuntu: install `wmctrl`/`xdotool` and `libglib2.0-bin`; confirm the window title contains `click.focusWindowTitle`.
- Browser-only DSH: set `click.url` to the DSH web URL.

### Still stuck

- Enable the plugin, then use **Send test notification** / **Preview sound** in Settings.
- Inspect the config file path shown at the bottom of the settings page.
- Set `DSH_SYSTEM_NOTIFY_DRY_RUN=1` in the Host environment to log the computed payload instead of delivering it.
- Check the DSH host log for `[dsh-system-notify]` warnings.

## Development

```bash
git clone https://github.com/JamesYasR/dsh-system-notify.git
cd dsh-system-notify
node --test          # unit tests: config, formatting, policy, payload builders
npm run verify       # syntax-check every runtime module
python tools/generate-sounds.py   # regenerate bundled WAVs
python tools/generate-icon.py     # regenerate icon.png (Pillow)
```

Install a local checkout as a bundle:

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-system-notify
```

Structure:

```text
index.mjs              Host plugin: events, policy, routes, optional tool
lib/config.mjs         defaults, validation, persistence
lib/events.mjs         session/goal/interaction event collection + policy
lib/format.mjs         style/privacy/localization rendering
lib/i18n.mjs           zh/en copy and duration formatting
lib/notify.mjs         Windows/macOS/Linux delivery + pure payload builders
lib/platform.mjs       backend detection (PowerShell, notify-send, paplay, …)
lib/routes.mjs         same-origin HTTP routes for the settings page
lib/tool.mjs           optional send_desktop_notification tool
lib/win-toast.ps1      WinRT toast + sound helper (Windows)
client/client.js       Settings → System Notifications page
test/                  Node built-in test runner suites
tools/                 asset generators (sounds, icon)
```

The delivery builders are pure and unit-tested on every platform; the Linux path is exercised in CI through payload/command tests (CI has no desktop session).

## Limitations

- Windows notification volume is controlled by the system sound scheme; `sound.volume` applies to Ubuntu only.
- Windows custom sounds must be WAV.
- Clicking focuses the DSH window, not a specific session: DSH’s deep link is `dsh://open`.
- Linux click support depends on `gdbus`, `dbus-monitor`, and a notification daemon that implements the freedesktop spec.
- The macOS path is best-effort and click support requires `terminal-notifier`.
- Toast banners may be suppressed by OS focus modes; this is expected system behaviour, not a plugin failure.

## License

[MIT](LICENSE). The two bundled sound files are original works generated by `tools/generate-sounds.py` and are covered by the same license. The icon is original SVG/PNG artwork created for this project.
