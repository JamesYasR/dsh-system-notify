# Security policy

## Scope

dsh-system-notify runs inside the DeepSeek Harness Host process and can spawn
local notification helpers:

- Windows: `powershell.exe` with `lib/win-toast.ps1`;
- Linux: `gdbus`, `dbus-monitor`, `notify-send`, `paplay`/`pw-play`/`aplay`,
  `wmctrl`/`xdotool`, `xdg-open`;
- macOS: `osascript`, `afplay`, optionally `terminal-notifier`.

## Data handling

- Notification text exists only in process memory and the transient OS toast.
- The only persisted file is the JSON config, written with user-only permissions
  where the OS supports it (`0600`).
- No network requests are made by the plugin.
- Click URLs are validated; `file:`, `javascript:`, `data:` and similar schemes
  are rejected.
- The settings HTTP routes are same-origin only (Origin check), body-capped, and
  do not expose secrets (there are none).

## Reporting

Please open a private security advisory on GitHub, or email the maintainer listed
in `package.json`, instead of filing a public issue for a vulnerability.
