# Security policy

## Scope

dsh-system-notify runs inside the DeepSeek Harness Host process and can spawn
local notification helpers:

- Windows: `powershell.exe` with `lib/win-toast.ps1` and `lib/responder.ps1`;
- Linux: `gdbus`, `dbus-monitor`, `notify-send`, `paplay`/`pw-play`/`aplay`,
  `wmctrl`/`xdotool`, `xdg-open`, `zenity`;
- macOS: `osascript`, `afplay`, optionally `terminal-notifier`.

## Data handling

- Notification content stays in process memory (the Windows payload is passed to
  the PowerShell helper through an environment variable) and in the OS toast.
  The plugin itself persists only the JSON config, written with user-only
  permissions where the OS supports it (`0600`). Windows Notification Center may
  retain shown toasts according to OS settings.
- No third-party network requests are made by the plugin; interaction callbacks
  are posted back to the DSH origin over its normal HTTP(S) route.
- Click URLs are validated against an allowlist (`http:`, `https:`, `dsh:`);
  `file:`, `javascript:`, `data:` and other schemes are rejected.
- The settings HTTP routes are same-origin only (Origin check) for configuration
  and uploads; interaction actions require a random per-prompt token. The
  Windows action protocol only forwards that token to the local plugin route.
- Interactive notifications only accept actions for a live pending request;
  stale or forged ids return `410` and never touch the config.
- Uploaded sounds are validated by container magic, capped at 5 MiB, and written
  with user-only permissions beside the config.

## Reporting

Please open a private security advisory on GitHub, or email the maintainer listed
in `package.json`, instead of filing a public issue for a vulnerability.
