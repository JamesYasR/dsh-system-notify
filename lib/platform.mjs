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

/** Validate that a custom icon is a reasonably sized PNG/JPEG/GIF/WebP. */
function isSupportedImage(file) {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size < 12 || stat.size > 512 * 1024) return false
    const descriptor = fs.openSync(file, 'r')
    const header = Buffer.alloc(12)
    try {
      fs.readSync(descriptor, header, 0, 12, 0)
    } finally {
      fs.closeSync(descriptor)
    }
    const png = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
    const gif = header.subarray(0, 4).toString('ascii') === 'GIF8'
    const webp =
      header.subarray(0, 4).toString('ascii') === 'RIFF' &&
      header.subarray(8, 12).toString('ascii') === 'WEBP'
    return png || jpeg || gif || webp
  } catch {
    return false
  }
}

/** Package icon used for toast/notification artwork. */
export function resolveIconPath(pkgDir, configIconPath = '') {
  if (typeof configIconPath === 'string' && configIconPath.trim()) {
    const custom = path.resolve(configIconPath)
    if (isSupportedImage(custom)) return custom
  }
  const bundled = path.join(pkgDir, 'icon.png')
  if (isSupportedImage(bundled)) return bundled
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
