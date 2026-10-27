/**
 * Cross-platform notification delivery.
 *
 * Windows: PowerShell + WinRT toast (with optional click-through via the
 * DSH desktop `dsh://open` deep link), plus System.Media sound playback.
 * Linux: libnotify `notify-send` or a raw `gdbus` Notify call (required for
 * clickable notifications); sound through paplay / pw-play / aplay.
 * macOS: osascript + afplay, with terminal-notifier when installed.
 *
 * The module never throws into the Host: every public method resolves to a
 * result object. Backends are pure builders + a small spawn layer so they can
 * be unit tested without a desktop session.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { translate } from './i18n.mjs'

function existsFile(target) {
  try {
    return Boolean(target) && fs.statSync(target).isFile()
  } catch {
    return false
  }
}

function clip(value, max) {
  const text = typeof value === 'string' ? value : ''
  const characters = Array.from(text)
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join('')}…`
}

/** Resolve the toast AppID, preferring an explicitly customised value. */
export function resolveWindowsAppId(config) {
  const configured =
    config && config.windows && typeof config.windows.appId === 'string'
      ? config.windows.appId.trim()
      : ''
  return configured || 'com.deepseek.dsh'
}

function capLines(lines) {
  const result = []
  for (const line of Array.isArray(lines) ? lines : []) {
    const text = typeof line === 'string' ? line.replace(/\s+/gu, ' ').trim() : ''
    if (!text) continue
    if (result.length >= 4) break
    result.push(clip(text, 240))
  }
  return result
}

export function bundledSoundPath(pkgDir, name) {
  if (typeof pkgDir !== 'string' || !pkgDir) return undefined
  return path.join(pkgDir, 'lib', 'sounds', `${name}.wav`)
}

/**
 * Resolve which sound should play for one notification.
 * @returns {{kind:'none'|'system'|'chime'|'alert'|'custom', path?:string, warning?:string}}
 */
export function resolveSound(config, soundKind = 'normal', options = {}) {
  const platform = options.platform || process.platform
  const pkgDir = options.pkgDir
  if (!config || !config.sound || config.sound.enabled !== true) return { kind: 'none' }
  const name = soundKind === 'error' ? config.sound.error : config.sound.normal
  if (name === 'none') return { kind: 'none' }
  if (name === 'custom') {
    const configured =
      soundKind === 'error'
        ? config.sound.customErrorPath || config.sound.customPath
        : config.sound.customNormalPath || config.sound.customPath
    const custom = typeof configured === 'string' ? configured.trim() : ''
    if (custom && existsFile(custom)) return { kind: 'custom', path: custom }
    return { kind: 'none', warning: 'custom-sound-missing' }
  }
  if (name === 'system') {
    if (platform === 'linux') {
      const systemPath = options.systemSoundPath
      if (systemPath && existsFile(systemPath)) return { kind: 'system', path: systemPath }
      const chime = bundledSoundPath(pkgDir, 'chime')
      if (existsFile(chime)) return { kind: 'system', path: chime, warning: 'system-sound-fallback' }
      return { kind: 'system' }
    }
    return { kind: 'system' }
  }
  const bundled = bundledSoundPath(pkgDir, name)
  if (existsFile(bundled)) return { kind: name, path: bundled }
  return { kind: 'none', warning: 'bundled-sound-missing' }
}

/**
 * Decide how Windows should play a resolved sound.
 *
 * The toast `<audio src>` schema only accepts `ms-winsoundevent:*` for unpackaged
 * desktop apps; a `file:///` WAV would be silently ignored (or rejected). So any
 * bundled/custom file is played separately by lib/win-toast.ps1 through
 * System.Media.SoundPlayer, while system sounds stay on the toast audio channel.
 */
function windowsAudioSource(sound, soundKind, wantToast) {
  if (sound.kind === 'none') return { silent: true, audio: null, playFile: null, playSystem: null }
  if (sound.kind === 'system') {
    if (wantToast) {
      return {
        silent: false,
        audio:
          soundKind === 'error'
            ? 'ms-winsoundevent:Notification.Reminder'
            : 'ms-winsoundevent:Notification.Default',
        playFile: null,
        playSystem: null
      }
    }
    return {
      silent: true,
      audio: null,
      playFile: null,
      playSystem: soundKind === 'error' ? 'Hand' : 'Asterisk'
    }
  }
  if (sound.path) {
    return { silent: true, audio: null, playFile: sound.path, playSystem: null }
  }
  return { silent: true, audio: null, playFile: null, playSystem: null }
}

/** Build the JSON payload consumed by lib/win-toast.ps1. */
export function buildWindowsPayload(rendered, config, capabilities, options = {}) {
  const pkgDir = options.pkgDir
  const sound = resolveSound(config, rendered.soundKind, {
    pkgDir,
    platform: 'win32'
  })
  const wantToast = config.delivery !== 'sound'
  const wantSound = config.delivery !== 'toast'
  const audioState = wantSound
    ? windowsAudioSource(sound, rendered.soundKind, wantToast)
    : { silent: true, audio: null, playFile: null, playSystem: null }
  const icon = capabilities && capabilities.iconPath ? capabilities.iconPath : undefined
  const click = Boolean(
    config.click && config.click.enabled === true && typeof config.click.url === 'string' && config.click.url
  )
  const language = rendered.language || 'en'
  return {
    appId: resolveWindowsAppId(config),
    title: clip(rendered.title, 180),
    lines: capLines(rendered.lines),
    toast: wantToast,
    soundOnly: !wantToast,
    silent: audioState.silent,
    audio: audioState.audio,
    playFile: audioState.playFile,
    playSystem: audioState.playSystem,
    icon: icon || null,
    iconUri: icon ? pathToFileURL(icon).href : null,
    duration: rendered.urgency === 'critical' ? 'long' : 'short',
    clickEnabled: click,
    clickUrl: click ? config.click.url : '',
    actionLabel: translate(language, 'action.openDsh')
  }
}

/** Build the sound-only payload used by the settings page preview button. */
export function buildWindowsSoundPayload(config, soundKind, capabilities, options = {}) {
  const sound = resolveSound(config, soundKind, {
    pkgDir: options.pkgDir,
    platform: 'win32'
  })
  const audioState = windowsAudioSource(sound, soundKind, false)
  return {
    appId: resolveWindowsAppId(config),
    title: '',
    lines: [],
    toast: false,
    soundOnly: true,
    silent: true,
    audio: null,
    playFile: audioState.playFile,
    playSystem: audioState.playSystem,
    icon: null,
    iconUri: null,
    duration: 'short',
    clickEnabled: false,
    clickUrl: '',
    actionLabel: ''
  }
}

function gvariantString(value) {
  return JSON.stringify(String(value ?? ''))
}

/** Build the protocol URL a Windows toast action calls back through. */
export function buildWindowsActionUrl(baseUrl, interactionId, token, action) {
  const params = new URLSearchParams({
    base: String(baseUrl || ''),
    id: String(interactionId || ''),
    token: String(token || ''),
    action: String(action || '')
  })
  return `dsh-system-notify://respond?${params.toString()}`
}

/** Build the action array `gdbus Notify` expects (default/open first). */
export function buildLinuxActionPairs(actions) {
  const pairs = []
  const open = (actions || []).find((action) => action.id === 'open')
  if (open) pairs.push('default', open.label)
  for (const action of actions || []) {
    if (action.id === 'open') continue
    pairs.push(action.id, action.label)
  }
  return pairs
}

/**
 * Build the Linux notification command.
 * Clickable notifications require gdbus + dbus-monitor so ActionInvoked can be
 * observed; without them we fall back to notify-send without a click action.
 */
export function buildLinuxNotification(rendered, config, capabilities, options = {}) {
  const language = rendered.language || 'en'
  const body = capLines(rendered.lines).join('\n')
  const timeoutMs = rendered.urgency === 'critical' ? 12_000 : 7_000
  const icon = capabilities && capabilities.iconPath ? capabilities.iconPath : ''
  const appName = (config.appName || 'DeepSeek Harness').slice(0, 80)
  const clickable = Boolean(
    config.click &&
      config.click.enabled === true &&
      config.click.url &&
      capabilities.commands &&
      capabilities.commands.gdbus &&
      capabilities.commands.dbusMonitor
  )

  if (capabilities.commands && capabilities.commands.gdbus) {
    const actions = clickable
      ? JSON.stringify(['default', translate(language, 'action.openDsh')])
      : '[]'
    return {
      mode: 'gdbus',
      command: capabilities.commands.gdbus,
      args: [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.Notifications',
        '--object-path',
        '/org/freedesktop/Notifications',
        '--method',
        'org.freedesktop.Notifications.Notify',
        gvariantString(appName),
        '0',
        gvariantString(icon),
        gvariantString(rendered.title),
        gvariantString(body),
        actions,
        '{}',
        String(timeoutMs)
      ],
      clickable,
      timeoutMs,
      actionLabel: translate(language, 'action.openDsh')
    }
  }

  if (capabilities.commands && capabilities.commands.notifySend) {
    const args = ['-a', appName, '-u', rendered.urgency, '-t', String(timeoutMs)]
    if (icon) args.push('-i', icon)
    args.push(rendered.title, body)
    return {
      mode: 'notify-send',
      command: capabilities.commands.notifySend,
      args,
      clickable: false,
      timeoutMs,
      actionLabel: translate(language, 'action.openDsh')
    }
  }

  return { mode: 'none', command: null, args: [], clickable: false, timeoutMs }
}

/** Build a clickable Linux notification carrying arbitrary action pairs. */
export function buildLinuxInteractive(rendered, config, capabilities, actions, options = {}) {
  const timeoutMs = options.timeoutMs || 30_000
  const icon = capabilities && capabilities.iconPath ? capabilities.iconPath : ''
  const appName = (config.appName || 'DeepSeek Harness').slice(0, 80)
  const pairs = buildLinuxActionPairs(actions)
  if (!capabilities.commands || !capabilities.commands.gdbus) {
    return { mode: 'none', command: null, args: [], timeoutMs }
  }
  return {
    mode: 'gdbus',
    command: capabilities.commands.gdbus,
    args: [
      'call',
      '--session',
      '--dest',
      'org.freedesktop.Notifications',
      '--object-path',
      '/org/freedesktop/Notifications',
      '--method',
      'org.freedesktop.Notifications.Notify',
      gvariantString(appName),
      '0',
      gvariantString(icon),
      gvariantString(rendered.title),
      gvariantString(capLines(rendered.lines).join('\n')),
      JSON.stringify(pairs),
      '{}',
      String(timeoutMs)
    ],
    pairs,
    timeoutMs
  }
}

/** Build the Linux sound player invocation. */
export function buildLinuxSoundCommand(config, sound, capabilities, options = {}) {
  if (!sound || sound.kind === 'none') return null
  const commands = (capabilities && capabilities.commands) || {}
  const pkgDir = options.pkgDir
  const volume = Math.round((Math.min(100, Math.max(0, config.sound.volume)) / 100) * 65536)
  if (sound.path) {
    if (commands.paplay) return { command: commands.paplay, args: [`--volume=${volume}`, sound.path] }
    if (commands.pwPlay) {
      return { command: commands.pwPlay, args: ['--volume', (volume / 65536).toFixed(2), sound.path] }
    }
    if (commands.aplay) {
      if (/\.wav$/iu.test(sound.path)) return { command: commands.aplay, args: ['-q', sound.path] }
      const chime = bundledSoundPath(pkgDir, 'chime')
      if (existsFile(chime)) return { command: commands.aplay, args: ['-q', chime] }
      return null
    }
    if (commands.canberra) return { command: commands.canberra, args: ['-i', 'complete'] }
    return null
  }
  if (commands.canberra) return { command: commands.canberra, args: ['-i', 'complete'] }
  return null
}

/** Extract the notification id from `gdbus call ... Notify` output. */
export function parseGdbusNotificationId(stdout) {
  const match = /uint32\s+(\d+)/u.exec(String(stdout || ''))
  return match ? Number(match[1]) : null
}

function formatMacAppleScriptString(value) {
  return JSON.stringify(String(value ?? ''))
}

function buildMacNotification(rendered, config, capabilities) {
  const body = capLines(rendered.lines).join('\n')
  const clickable = Boolean(
    config.click && config.click.enabled === true && config.click.url && capabilities.commands.terminalNotifier
  )
  if (clickable) {
    return {
      mode: 'terminal-notifier',
      command: capabilities.commands.terminalNotifier,
      args: [
        '-title',
        rendered.title,
        '-message',
        body,
        '-open',
        config.click.url
      ],
      clickable
    }
  }
  const script = `display notification ${formatMacAppleScriptString(body)} with title ${formatMacAppleScriptString(rendered.title)}`
  return {
    mode: 'osascript',
    command: capabilities.commands.osascript,
    args: ['-e', script],
    clickable: false
  }
}

/** Build the desktop notification client. */
export function createNotifier(options = {}) {
  const platform = options.platform || process.platform
  const capabilities = options.capabilities
  const pkgDir = options.pkgDir
  const env = options.env || process.env
  const logger = typeof options.logger === 'function' ? options.logger : () => {}
  const spawnImpl = options.spawnImpl || spawn
  const systemSoundPath = capabilities && capabilities.linuxSystemSound
  const dryRun = env.DSH_SYSTEM_NOTIFY_DRY_RUN === '1'
  const children = new Set()

  function track(child) {
    if (!child) return child
    children.add(child)
    const done = () => children.delete(child)
    child.once('close', done)
    child.once('error', done)
    return child
  }

  function spawnTracked(command, args, spawnOptions = {}) {
    if (!command) return undefined
    try {
      const child = spawnImpl(command, args, {
        windowsHide: true,
        detached: false,
        ...spawnOptions
      })
      return track(child)
    } catch (error) {
      logger(`[dsh-system-notify] spawn failed (${command}): ${error.message}`)
      return undefined
    }
  }

  function waitFor(child, timeoutMs = 15_000) {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      if (child.stdout) child.stdout.on('data', (chunk) => { stdout += String(chunk) })
      if (child.stderr) child.stderr.on('data', (chunk) => { stderr += String(chunk) })
      const timer = setTimeout(() => {
        try { child.kill() } catch { /* already gone */ }
        finish({ ok: false, error: 'timeout', stdout, stderr })
      }, timeoutMs)
      child.once('close', (code) => {
        finish({ ok: code === 0, code, stdout, stderr, error: code === 0 ? undefined : stderr.trim() || `exit ${code}` })
      })
      child.once('error', (error) => finish({ ok: false, error: error.message, stdout, stderr }))
    })
  }

  function spawnAndForget(command, args, spawnOptions = {}) {
    const child = spawnTracked(command, args, { stdio: 'ignore', ...spawnOptions })
    if (!child) return false
    child.once('error', (error) => logger(`[dsh-system-notify] child error (${command}): ${error.message}`))
    return true
  }

  async function runSound(sound, config, wait) {
    if (!sound || sound.kind === 'none') return { ok: true, skipped: true }
    if (dryRun) return { ok: true, dryRun: true }
    if (platform === 'linux') {
      const plan = buildLinuxSoundCommand(config, sound, capabilities, { pkgDir })
      if (!plan) return { ok: false, error: 'sound-player-unavailable' }
      if (wait) {
        const child = spawnTracked(plan.command, plan.args, { stdio: 'ignore' })
        if (!child) return { ok: false, error: 'sound-spawn-failed' }
        const result = await waitFor(child, 8_000)
        return { ok: result.ok, error: result.error, backend: 'linux-sound' }
      }
      spawnAndForget(plan.command, plan.args)
      return { ok: true, backend: 'linux-sound' }
    }
    if (platform === 'darwin') {
      const soundPath =
        sound.kind === 'system' ? '/System/Library/Sounds/Glass.aiff' : sound.path
      if (!soundPath) return { ok: false, error: 'sound-file-unavailable' }
      if (wait) {
        const child = spawnTracked(capabilities.commands.afplay, [soundPath], { stdio: 'ignore' })
        if (!child) return { ok: false, error: 'afplay-unavailable' }
        const result = await waitFor(child, 8_000)
        return { ok: result.ok, error: result.error, backend: 'afplay' }
      }
      spawnAndForget(capabilities.commands.afplay, [soundPath])
      return { ok: true, backend: 'afplay' }
    }
    return { ok: false, error: 'unsupported-platform' }
  }

  async function runWindowsPayload(payload, options = {}) {
    if (!capabilities || !capabilities.toast || !capabilities.toast.available) {
      return { ok: false, error: 'powershell-unavailable' }
    }
    if (dryRun) return { ok: true, dryRun: true, backend: 'windows-toast', payload }
    const script = path.join(pkgDir, 'lib', 'win-toast.ps1')
    const child = spawnTracked(
      capabilities.commands.powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, DSH_NOTIFY_PAYLOAD: JSON.stringify(payload) }
      }
    )
    if (!child) return { ok: false, error: 'powershell-spawn-failed' }
    if (options.wait !== true) return { ok: true, backend: 'windows-toast' }
    const result = await waitFor(child, options.timeoutMs || 20_000)
    return { ok: result.ok, error: result.error, backend: 'windows-toast' }
  }

  async function sendWindowsSound(config, soundKind) {
    const payload = buildWindowsSoundPayload(config, soundKind, capabilities, { pkgDir })
    const result = await runWindowsPayload(payload, { wait: true, timeoutMs: 8_000 })
    return { ...result, backend: 'windows-sound' }
  }

  async function sendWindows(rendered, config, wait) {
    const payload = buildWindowsPayload(rendered, config, capabilities, { pkgDir })
    return runWindowsPayload(payload, { wait, timeoutMs: 20_000 })
  }

  async function sendLinux(rendered, config, wait) {
    const sound = resolveSound(config, rendered.soundKind, {
      pkgDir,
      platform: 'linux',
      systemSoundPath
    })
    if (config.delivery === 'sound') {
      if (dryRun) return { ok: true, dryRun: true, backend: 'linux-sound' }
      const soundResult = await runSound(sound, config, false)
      return {
        ok: soundResult.ok === true,
        error: soundResult.error,
        backend: 'linux-sound',
        skipped: soundResult.skipped === true
      }
    }

    const plan = buildLinuxNotification(rendered, config, capabilities, { pkgDir })
    if (dryRun) return { ok: true, dryRun: true, backend: plan.mode, plan }

    let soundResult = { ok: true, skipped: true }
    if (config.delivery !== 'toast' && sound.kind !== 'none') {
      soundResult = await runSound(sound, config, false)
    }
    if (plan.mode === 'none') {
      return { ok: false, error: 'notification-backend-unavailable', sound: soundResult.ok }
    }

    let notificationId = null
    let ok = true
    let backend = plan.mode
    let error
    if (plan.mode === 'gdbus') {
      const child = spawnTracked(plan.command, plan.args, { stdio: ['ignore', 'pipe', 'pipe'] })
      if (!child) {
        ok = false
        error = 'gdbus-spawn-failed'
      } else {
        const result = await waitFor(child, 5_000)
        if (result.ok) {
          notificationId = parseGdbusNotificationId(result.stdout)
        } else {
          ok = false
          error = result.error || 'gdbus-failed'
        }
      }
    } else {
      const child = spawnTracked(plan.command, plan.args, { stdio: ['ignore', 'ignore', 'pipe'] })
      if (!child) {
        ok = false
        error = 'notify-send-spawn-failed'
      } else {
        const result = await waitFor(child, 5_000)
        ok = result.ok
        error = result.error
      }
    }

    if (ok && plan.mode === 'gdbus' && plan.clickable && notificationId !== null) {
      watchLinuxAction(notificationId, plan.timeoutMs, (action) => {
        if (action === 'default' || action === 'open' || action === 'open-dsh') {
          void focusLinuxDsh(config, capabilities, logger, spawnImpl)
        }
      })
    }

    if (!ok && capabilities.commands.notifySend) {
      const fallbackArgs = ['-a', config.appName, '-u', rendered.urgency, '-t', String(plan.timeoutMs)]
      if (capabilities.iconPath) fallbackArgs.push('-i', capabilities.iconPath)
      fallbackArgs.push(rendered.title, capLines(rendered.lines).join('\n'))
      const fallbackChild = spawnTracked(capabilities.commands.notifySend, fallbackArgs, {
        stdio: ['ignore', 'ignore', 'pipe']
      })
      if (fallbackChild) {
        const fallbackResult = await waitFor(fallbackChild, 5_000)
        backend = 'notify-send'
        ok = fallbackResult.ok
        error = fallbackResult.error
      }
    }
    return { ok, error, backend, notificationId, sound: soundResult.ok }
  }

  function watchLinuxAction(notificationId, timeoutMs, onAction) {
    const monitor = spawnTracked(
      capabilities.commands.dbusMonitor,
      [
        '--session',
        "type='signal',interface='org.freedesktop.Notifications',member='ActionInvoked'"
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    if (!monitor) return false
    if (typeof monitor.unref === 'function') monitor.unref()
    let buffer = ''
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { monitor.kill() } catch { /* already gone */ }
    }
    const dispatch = (action) => {
      finish()
      if (typeof onAction === 'function') {
        try {
          void onAction(action)
        } catch (error) {
          logger(`[dsh-system-notify] action handler failed: ${error instanceof Error ? error.message : error}`)
        }
      }
    }
    const timer = setTimeout(finish, Math.max(5_000, timeoutMs + 8_000))
    if (timer.unref) timer.unref()
    if (monitor.stdout) {
      monitor.stdout.on('data', (chunk) => {
        buffer += String(chunk)
        const pattern = /member=ActionInvoked[\s\S]*?uint32\s+(\d+)[\s\S]*?string\s+"([^"]*)"/gu
        let match = pattern.exec(buffer)
        while (match) {
          if (Number(match[1]) === notificationId) {
            dispatch(match[2])
            return
          }
          match = pattern.exec(buffer)
        }
        if (buffer.length > 200_000) buffer = buffer.slice(-50_000)
      })
    }
    monitor.once('error', finish)
    monitor.once('close', () => { settled = true; clearTimeout(timer) })
    return true
  }

  async function sendMac(rendered, config, wait) {
    const sound = resolveSound(config, rendered.soundKind, {
      pkgDir,
      platform: 'darwin'
    })
    if (config.delivery === 'sound') {
      if (dryRun) return { ok: true, dryRun: true, backend: 'afplay' }
      const result = await runSound(sound, config, false)
      return { ok: result.ok, error: result.error, backend: 'afplay' }
    }
    const plan = buildMacNotification(rendered, config, capabilities)
    if (dryRun) return { ok: true, dryRun: true, backend: plan.mode, plan }
    let ok = true
    if (plan.command) {
      const child = spawnTracked(plan.command, plan.args, { stdio: 'ignore' })
      if (!child) ok = false
    } else {
      ok = false
    }
    if (config.delivery !== 'toast' && sound.kind !== 'none') {
      await runSound(sound, config, false)
    }
    return { ok, backend: plan.mode }
  }

  async function send(rendered, config, sendOptions = {}) {
    const wait = sendOptions.wait === true
    try {
      if (config.enabled !== true) return { ok: true, skipped: true }
      if (platform === 'win32') return await sendWindows(rendered, config, wait)
      if (platform === 'linux') return await sendLinux(rendered, config, wait)
      if (platform === 'darwin') return await sendMac(rendered, config, wait)
      return { ok: false, error: 'unsupported-platform' }
    } catch (error) {
      logger(`[dsh-system-notify] send failed: ${error && error.message ? error.message : error}`)
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function playSound(config, soundKind = 'normal', soundOptions = {}) {
    try {
      if (dryRun) {
        const sound = resolveSound(config, soundKind, { pkgDir, platform, systemSoundPath })
        return { ok: true, dryRun: true, sound }
      }
      if (platform === 'win32') return sendWindowsSound(config, soundKind)
      const sound = resolveSound(config, soundKind, { pkgDir, platform, systemSoundPath })
      return runSound(sound, config, soundOptions.wait === true)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function sendInteractive(rendered, config, spec = {}) {
    const actions = Array.isArray(spec.actions) ? spec.actions.slice(0, 5) : []
    if (actions.length === 0) return { ok: false, error: 'no-interactive-actions' }
    if (config.delivery === 'sound') return { ok: false, error: 'sound-only-mode' }

    if (platform === 'win32') {
      const baseUrl = typeof spec.baseUrl === 'string' ? spec.baseUrl.replace(/\/+$/u, '') : ''
      if (!/^https?:\/\/\S+$/u.test(baseUrl)) {
        return { ok: false, error: 'interactive-base-url-missing' }
      }
      const payload = buildWindowsPayload(rendered, config, capabilities, { pkgDir })
      const urls = actions.map((action) => ({
        id: action.id,
        label: action.label,
        url: buildWindowsActionUrl(baseUrl, spec.interactionId, spec.token, action.id)
      }))
      const open = urls.find((action) => action.id === 'open')
      payload.actions = urls.map((action) => ({
        label: action.label,
        arguments: action.url,
        activationType: 'protocol'
      }))
      payload.clickEnabled = Boolean(open)
      payload.clickUrl = open ? open.url : ''
      payload.tag = `dsh-${String(spec.interactionId || '').replace(/[^a-zA-Z0-9]/gu, '').slice(0, 12)}`
      payload.group = 'dsh-notify'
      const result = await runWindowsPayload(payload, {
        wait: spec.wait === true,
        timeoutMs: 20_000
      })
      if (!result.ok) return result
      return {
        ok: true,
        backend: 'windows-toast',
        handle: {
          platform: 'win32',
          tag: payload.tag,
          group: payload.group,
          appId: payload.appId,
          interactionId: spec.interactionId
        }
      }
    }

    if (platform === 'linux') {
      if (!capabilities.commands || !capabilities.commands.gdbus || !capabilities.commands.dbusMonitor) {
        return { ok: false, error: 'interactive-unsupported' }
      }
      const timeoutMs = Math.max(5_000, (config.interactive && config.interactive.timeoutSec
        ? config.interactive.timeoutSec
        : 20) * 1000)
      const plan = buildLinuxInteractive(rendered, config, capabilities, actions, { timeoutMs })
      if (dryRun) return { ok: true, dryRun: true, backend: 'gdbus', plan }
      if (plan.mode === 'none') return { ok: false, error: 'notification-backend-unavailable' }
      const child = spawnTracked(plan.command, plan.args, { stdio: ['ignore', 'pipe', 'pipe'] })
      if (!child) return { ok: false, error: 'gdbus-spawn-failed' }
      const result = await waitFor(child, 5_000)
      if (!result.ok) return { ok: false, error: result.error || 'gdbus-failed' }
      const notificationId = parseGdbusNotificationId(result.stdout)
      if (notificationId === null) return { ok: false, error: 'notification-id-missing' }
      watchLinuxAction(notificationId, timeoutMs, (action) => {
        if (typeof spec.onAction === 'function') spec.onAction(action === 'default' ? 'open' : action)
      })
      const sound = resolveSound(config, rendered.soundKind, {
        pkgDir,
        platform: 'linux',
        systemSoundPath
      })
      if (config.delivery !== 'toast' && sound.kind !== 'none') {
        void runSound(sound, config, false)
      }
      return {
        ok: true,
        backend: 'gdbus',
        handle: { platform: 'linux', notificationId }
      }
    }

    return { ok: false, error: 'interactive-unsupported' }
  }

  async function dismiss(handle) {
    try {
      if (!handle) return { ok: true, skipped: true }
      if (handle.platform === 'win32' && handle.tag) {
        const payload = {
          dismissOnly: true,
          appId: handle.appId,
          tag: handle.tag,
          group: handle.group || 'dsh-notify'
        }
        return runWindowsPayload(payload, { wait: true, timeoutMs: 8_000 })
      }
      if (handle.platform === 'linux' && handle.notificationId !== null && handle.notificationId !== undefined) {
        if (capabilities.commands && capabilities.commands.gdbus) {
          spawnAndForget(capabilities.commands.gdbus, [
            'call',
            '--session',
            '--dest',
            'org.freedesktop.Notifications',
            '--object-path',
            '/org/freedesktop/Notifications',
            '--method',
            'org.freedesktop.Notifications.CloseNotification',
            String(handle.notificationId)
          ])
        }
        return { ok: true }
      }
      return { ok: true, skipped: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  function dispose() {
    for (const child of children) {
      try { child.kill() } catch { /* already gone */ }
    }
    children.clear()
  }

  return {
    platform,
    capabilities,
    dryRun,
    send,
    sendInteractive,
    dismiss,
    playSound,
    dispose,
    buildWindowsPayload: (rendered, config) =>
      buildWindowsPayload(rendered, config, capabilities, { pkgDir })
  }
}

async function focusLinuxDsh(config, capabilities, logger, spawnImpl) {
  const title = config.click.focusWindowTitle || 'DeepSeek Harness'
  const url = config.click.url
  const commands = capabilities.commands || {}
  const run = (command, args, timeoutMs = 2_500) =>
    new Promise((resolve) => {
      if (!command) return resolve(false)
      let child
      try {
        child = spawnImpl(command, args, { stdio: 'ignore', windowsHide: true })
      } catch {
        return resolve(false)
      }
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { child.kill() } catch { /* already gone */ }
        resolve(false)
      }, timeoutMs)
      child.once('error', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(false)
      })
      child.once('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(code === 0)
      })
    })

  if (commands.xdotool) {
    if (await run(commands.xdotool, ['search', '--name', title, 'windowactivate', '--sync'])) return true
  }
  if (commands.wmctrl) {
    if (await run(commands.wmctrl, ['-a', title])) return true
  }
  if (config.click.openFallback && commands.xdgOpen && url) {
    const opened = await run(commands.xdgOpen, [url], 4_000)
    if (!opened) logger('[dsh-system-notify] could not open the DSH deep link')
    return opened
  }
  return false
}
