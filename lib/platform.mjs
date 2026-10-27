/**
 * Platform capability detection for dsh-system-notify.
 *
 * Uses only Node built-ins. Every check is best-effort: a missing command is a
 * capability note, never a startup failure. The settings page shows the result
 * so users can see exactly which backend (toast / sound / click) is active.
 */

import fs from 'node:fs'
import path from 'node:path'

/** Look up an executable on PATH without spawning a shell. */
export function findCommand(name, env = process.env, platform = process.platform) {
  if (typeof name !== 'string' || name.length === 0) return undefined
  const pathValue = env.PATH || env.Path || ''
  const directories = pathValue.split(path.delimiter).filter(Boolean)
  const extensions =
    platform === 'win32'
      ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`)
      try {
        if (fs.statSync(candidate).isFile()) return candidate
      } catch {
        // not here
      }
    }
  }
  return undefined
}

function commandAvailable(commands, key) {
  return Boolean(commands[key])
}

function windowsPowerShell(env) {
  const root = env.SystemRoot || env.windir || 'C:\\Windows'
  const candidate = path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  try {
    if (fs.statSync(candidate).isFile()) return candidate
  } catch {
    // fall through to PATH
  }
  return findCommand('powershell', env, 'win32')
}

function linuxSystemSound() {
  const candidates = [
    '/usr/share/sounds/freedesktop/stereo/complete.oga',
    '/usr/share/sounds/freedesktop/stereo/message-new-instant.oga',
    '/usr/share/sounds/freedesktop/stereo/bell.oga'
  ]
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate
    } catch {
      // try next
    }
  }
  return undefined
}

/** Package icon used for toast/notification artwork. */
export function resolveIconPath(pkgDir, configIconPath = '') {
  if (typeof configIconPath === 'string' && configIconPath.trim()) {
    try {
      if (fs.statSync(configIconPath).isFile()) return path.resolve(configIconPath)
    } catch {
      // invalid custom icon: fall back to the bundled one
    }
  }
  const bundled = path.join(pkgDir, 'icon.png')
  try {
    if (fs.statSync(bundled).isFile()) return bundled
  } catch {
    // no bundled image
  }
  return undefined
}

export function detectCapabilities(options = {}) {
  const platform = options.platform || process.platform
  const env = options.env || process.env
  const pkgDir = options.pkgDir || process.cwd()
  const notes = []
  const commands = {
    powershell: platform === 'win32' ? windowsPowerShell(env) : undefined,
    notifySend: platform === 'linux' ? findCommand('notify-send', env, platform) : undefined,
    gdbus: platform === 'linux' ? findCommand('gdbus', env, platform) : undefined,
    dbusMonitor: platform === 'linux' ? findCommand('dbus-monitor', env, platform) : undefined,
    paplay: platform === 'linux' ? findCommand('paplay', env, platform) : undefined,
    pwPlay: platform === 'linux' ? findCommand('pw-play', env, platform) : undefined,
    aplay: platform === 'linux' ? findCommand('aplay', env, platform) : undefined,
    canberra: platform === 'linux' ? findCommand('canberra-gtk-play', env, platform) : undefined,
    wmctrl: platform === 'linux' ? findCommand('wmctrl', env, platform) : undefined,
    xdotool: platform === 'linux' ? findCommand('xdotool', env, platform) : undefined,
    xdgOpen: platform === 'linux' ? findCommand('xdg-open', env, platform) : undefined,
    osascript: platform === 'darwin' ? findCommand('osascript', env, platform) : undefined,
    afplay: platform === 'darwin' ? findCommand('afplay', env, platform) : undefined,
    terminalNotifier:
      platform === 'darwin' ? findCommand('terminal-notifier', env, platform) : undefined,
    open: platform === 'darwin' ? findCommand('open', env, platform) : undefined
  }

  let toast = { available: false, backend: 'none' }
  let sound = { available: false, backend: 'none' }
  let click = { available: false, backend: 'none' }

  if (platform === 'win32') {
    if (commands.powershell) {
      toast = { available: true, backend: 'windows-toast' }
      sound = { available: true, backend: 'powershell-soundplayer' }
      click = { available: true, backend: 'dsh-protocol' }
      notes.push('click.requiresDshDesktop')
    } else {
      notes.push('windows.powershellMissing')
    }
  } else if (platform === 'linux') {
    if (commands.gdbus) {
      toast = { available: true, backend: 'gdbus' }
    } else if (commands.notifySend) {
      toast = { available: true, backend: 'notify-send' }
    } else {
      notes.push('linux.libnotifyMissing')
    }
    if (commands.paplay) sound = { available: true, backend: 'paplay' }
    else if (commands.pwPlay) sound = { available: true, backend: 'pw-play' }
    else if (commands.aplay) sound = { available: true, backend: 'aplay' }
    else if (commands.canberra) sound = { available: true, backend: 'canberra-gtk-play' }
    else notes.push('linux.soundPlayerMissing')

    const canFocus = Boolean(commands.wmctrl || commands.xdotool || commands.xdgOpen)
    if (commands.gdbus && commands.dbusMonitor && canFocus) {
      click = { available: true, backend: 'notifications-dbus' }
      if (!commands.wmctrl && !commands.xdotool) notes.push('linux.focusHelperMissing')
    } else if (canFocus) {
      click = { available: false, backend: 'none' }
      notes.push('linux.clickRequiresGdbus')
    }
    if (!commands.dbusMonitor) notes.push('linux.dbusMonitorMissing')
  } else if (platform === 'darwin') {
    if (commands.osascript) toast = { available: true, backend: 'osascript' }
    if (commands.afplay) sound = { available: true, backend: 'afplay' }
    if (commands.terminalNotifier) {
      click = { available: true, backend: 'terminal-notifier' }
    } else {
      notes.push('mac.clickNeedsTerminalNotifier')
    }
  } else {
    notes.push('platform.unsupported')
  }

  return {
    platform,
    commands,
    toast,
    sound,
    click,
    notes: [...new Set(notes)],
    linuxSystemSound: platform === 'linux' ? linuxSystemSound() : undefined,
    iconPath: resolveIconPath(pkgDir, options.iconPath),
    appName: options.appName || 'DeepSeek Harness',
    configPath: options.configPath
  }
}
