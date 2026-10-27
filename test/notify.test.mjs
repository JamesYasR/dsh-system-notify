import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { normalizeConfig } from '../lib/config.mjs'
import { renderNotification } from '../lib/format.mjs'
import { resolveIconPath } from '../lib/platform.mjs'
import {
  buildLinuxActionPairs,
  buildLinuxInteractive,
  buildLinuxNotification,
  buildLinuxSoundCommand,
  buildWindowsActionUrl,
  buildWindowsPayload,
  buildWindowsSoundPayload,
  createNotifier,
  parseGdbusNotificationId,
  resolveSound
} from '../lib/notify.mjs'

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconPath = path.join(pkgDir, 'icon.png')

function winCapabilities() {
  return {
    platform: 'win32',
    commands: { powershell: 'powershell.exe' },
    toast: { available: true, backend: 'windows-toast' },
    sound: { available: true, backend: 'powershell-soundplayer' },
    click: { available: true, backend: 'dsh-protocol' },
    notes: [],
    iconPath
  }
}

function linuxCapabilities(overrides = {}) {
  return {
    platform: 'linux',
    commands: {
      gdbus: '/usr/bin/gdbus',
      dbusMonitor: '/usr/bin/dbus-monitor',
      notifySend: '/usr/bin/notify-send',
      paplay: '/usr/bin/paplay',
      wmctrl: '/usr/bin/wmctrl',
      xdotool: '/usr/bin/xdotool',
      xdgOpen: '/usr/bin/xdg-open'
    },
    toast: { available: true, backend: 'gdbus' },
    sound: { available: true, backend: 'paplay' },
    click: { available: true, backend: 'notifications-dbus' },
    notes: [],
    iconPath,
    linuxSystemSound: '/usr/share/sounds/freedesktop/stereo/complete.oga',
    ...overrides
  }
}

function fixture(overrides = {}) {
  const config = normalizeConfig({
    delivery: 'both',
    click: { enabled: true, url: 'dsh://open' },
    include: { sessionId: true },
    ...overrides
  })
  const rendered = renderNotification(
    {
      kind: 'turnError',
      sessionId: 'session-1234567890',
      sessionTitle: 'Build',
      cwd: '/home/me/app',
      turn: 2,
      durationMs: 5_000,
      error: { message: 'connection reset', code: 'ECONNRESET' }
    },
    config,
    { env: {} }
  )
  return { config, rendered }
}

test('sound resolution prefers bundled chime/alert and reports missing customs', () => {
  const config = normalizeConfig({})
  assert.equal(resolveSound(config, 'normal', { pkgDir, platform: 'win32' }).kind, 'system')
  assert.equal(
    resolveSound(normalizeConfig({ sound: { normal: 'chime' } }), 'normal', { pkgDir, platform: 'win32' }).kind,
    'chime'
  )
  assert.equal(
    resolveSound(normalizeConfig({ sound: { error: 'alert' } }), 'error', { pkgDir, platform: 'win32' }).kind,
    'alert'
  )
  const missing = resolveSound(
    normalizeConfig({ sound: { normal: 'custom', customPath: '/nope/sound.wav' } }),
    'normal',
    { pkgDir, platform: 'win32' }
  )
  assert.equal(missing.kind, 'none')
  assert.equal(missing.warning, 'custom-sound-missing')
  const disabled = resolveSound(normalizeConfig({ sound: { enabled: false } }), 'normal', {
    pkgDir,
    platform: 'win32'
  })
  assert.equal(disabled.kind, 'none')
})

test('Windows payload maps sound, icon, duration and click activation', () => {
  const { config, rendered } = fixture()
  const payload = buildWindowsPayload(rendered, config, winCapabilities(), { pkgDir })
  assert.equal(payload.toast, true)
  assert.equal(payload.silent, true)
  assert.equal(payload.audio, null)
  assert.ok(String(payload.playFile).endsWith('alert.wav'))
  assert.equal(payload.duration, 'long')
  assert.equal(payload.clickEnabled, true)
  assert.equal(payload.clickUrl, 'dsh://open')
  assert.ok(payload.iconUri.startsWith('file:///'))
  assert.equal(payload.lines.length, 3)
  assert.equal(payload.appId, 'com.deepseek.dsh')

  const systemError = fixture({ sound: { error: 'system' } })
  const systemPayload = buildWindowsPayload(systemError.rendered, systemError.config, winCapabilities(), {
    pkgDir
  })
  assert.equal(systemPayload.silent, false)
  assert.equal(systemPayload.audio, 'ms-winsoundevent:Notification.Reminder')
  assert.equal(systemPayload.playFile, null)
})

test('Windows payload can be silent, toast-only or sound-only', () => {
  const normal = fixture({ sound: { enabled: false } })
  const silent = buildWindowsPayload(normal.rendered, normal.config, winCapabilities(), { pkgDir })
  assert.equal(silent.silent, true)
  assert.equal(silent.audio, null)
  assert.equal(silent.playFile, null)

  const toastOnly = fixture({ delivery: 'toast', sound: { normal: 'chime', error: 'chime' } })
  const toastPayload = buildWindowsPayload(toastOnly.rendered, toastOnly.config, winCapabilities(), { pkgDir })
  assert.equal(toastPayload.toast, true)
  assert.equal(toastPayload.silent, true)
  assert.equal(toastPayload.audio, null)
  assert.equal(toastPayload.playFile, null)

  const bothChime = fixture({ sound: { normal: 'chime', error: 'chime' } })
  const chimePayload = buildWindowsPayload(bothChime.rendered, bothChime.config, winCapabilities(), { pkgDir })
  assert.equal(chimePayload.silent, true)
  assert.equal(chimePayload.audio, null)
  assert.ok(String(chimePayload.playFile).endsWith('chime.wav'))

  const soundOnly = fixture({ delivery: 'sound' })
  const soundPayload = buildWindowsPayload(soundOnly.rendered, soundOnly.config, winCapabilities(), { pkgDir })
  assert.equal(soundPayload.toast, false)
  assert.equal(soundPayload.soundOnly, true)
  assert.ok(String(soundPayload.playFile).endsWith('alert.wav'))

  const systemSoundOnly = fixture({ delivery: 'sound', sound: { error: 'system' } })
  const systemPayload = buildWindowsPayload(
    systemSoundOnly.rendered,
    systemSoundOnly.config,
    winCapabilities(),
    { pkgDir }
  )
  assert.equal(systemPayload.playSystem, 'Hand')

  const soundPreview = buildWindowsSoundPayload(soundOnly.config, 'normal', winCapabilities(), { pkgDir })
  assert.equal(soundPreview.toast, false)
  assert.equal(soundPreview.playSystem, 'Asterisk')
})

test('click can be disabled in the payload', () => {
  const { config, rendered } = fixture({ click: { enabled: false } })
  const payload = buildWindowsPayload(rendered, config, winCapabilities(), { pkgDir })
  assert.equal(payload.clickEnabled, false)
  assert.equal(payload.clickUrl, '')
})

test('toast AppID defaults to the DSH AUMID and accepts a custom value', () => {
  const { config, rendered } = fixture()
  const payload = buildWindowsPayload(rendered, config, winCapabilities(), { pkgDir })
  assert.equal(payload.appId, 'com.deepseek.dsh')
  const custom = fixture({ windows: { appId: 'My.Custom.Toast' } })
  const customPayload = buildWindowsPayload(custom.rendered, custom.config, winCapabilities(), { pkgDir })
  assert.equal(customPayload.appId, 'My.Custom.Toast')
})

test('invalid custom icons fall back to the bundled PNG', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-notify-icon-'))
  const bogus = path.join(directory, 'icon.txt')
  try {
    fs.writeFileSync(bogus, 'not an image', 'utf8')
    assert.equal(resolveIconPath(pkgDir, bogus), path.join(pkgDir, 'icon.png'))
    assert.equal(resolveIconPath(pkgDir, path.join(directory, 'missing.png')), path.join(pkgDir, 'icon.png'))
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('interactive action URLs carry the interaction token and base origin', () => {
  const url = buildWindowsActionUrl('http://127.0.0.1:51625', 'interaction-1', 'secret-token', 'allow')
  const parsed = new URL(url)
  assert.equal(parsed.protocol, 'dsh-system-notify:')
  assert.equal(parsed.searchParams.get('base'), 'http://127.0.0.1:51625')
  assert.equal(parsed.searchParams.get('id'), 'interaction-1')
  assert.equal(parsed.searchParams.get('token'), 'secret-token')
  assert.equal(parsed.searchParams.get('action'), 'allow')
})

test('Linux interactive action pairs keep open as the default action', () => {
  const pairs = buildLinuxActionPairs([
    { id: 'allow', label: 'Approve' },
    { id: 'deny', label: 'Reject' },
    { id: 'open', label: 'Open DSH' }
  ])
  assert.deepEqual(pairs, ['default', 'Open DSH', 'allow', 'Approve', 'deny', 'Reject'])
})

test('Windows interactive delivery builds protocol actions and a dismissible tag', async () => {
  const { config, rendered } = fixture()
  const calls = []
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setImmediate(() => child.emit('close', 0))
    return child
  }
  const notifier = createNotifier({
    platform: 'win32',
    capabilities: winCapabilities(),
    pkgDir,
    env: {},
    spawnImpl,
    logger: () => {}
  })
  const result = await notifier.sendInteractive(rendered, config, {
    interactionId: 'interaction-1',
    token: 'secret-token',
    baseUrl: 'http://127.0.0.1:51625',
    actions: [
      { id: 'allow', label: 'Approve' },
      { id: 'deny', label: 'Reject' },
      { id: 'open', label: 'Open DSH' }
    ],
    onAction: () => {}
  })
  assert.equal(result.ok, true)
  assert.equal(result.handle.platform, 'win32')
  assert.ok(result.handle.tag.length <= 16)
  const payload = JSON.parse(calls[0].options.env.DSH_NOTIFY_PAYLOAD)
  assert.equal(payload.actions.length, 3)
  assert.ok(payload.actions.every((action) => action.arguments.startsWith('dsh-system-notify://respond?')))
  assert.equal(payload.clickEnabled, true)
  assert.ok(payload.clickUrl.startsWith('dsh-system-notify://respond?'))
  notifier.dispose()
})

test('Linux interactive delivery arms action monitoring for the gdbus notification', async () => {
  const { config, rendered } = fixture()
  const calls = []
  const spawnImpl = (command, args) => {
    calls.push({ command, args })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setImmediate(() => {
      if (command === '/usr/bin/gdbus') {
        child.stdout.emit('data', '(uint32 55,)\n')
        child.emit('close', 0)
      }
    })
    return child
  }
  const notifier = createNotifier({
    platform: 'linux',
    capabilities: linuxCapabilities(),
    pkgDir,
    env: {},
    spawnImpl,
    logger: () => {}
  })
  const result = await notifier.sendInteractive(rendered, config, {
    interactionId: 'i1',
    token: 't',
    actions: [
      { id: 'allow', label: 'Approve' },
      { id: 'deny', label: 'Reject' },
      { id: 'open', label: 'Open DSH' }
    ],
    onAction: () => {}
  })
  assert.equal(result.ok, true)
  assert.equal(result.handle.notificationId, 55)
  assert.ok(calls.some((call) => call.command === '/usr/bin/dbus-monitor'))
  const gdbusCall = calls.find((call) => call.command === '/usr/bin/gdbus')
  assert.ok(gdbusCall.args.some((arg) => String(arg).includes('"default"')))
  notifier.dispose()
})

test('interactive payload builder supports multi-question fallbacks', () => {
  const { config, rendered } = fixture()
  const plan = buildLinuxInteractive(
    rendered,
    config,
    linuxCapabilities(),
    [
      { id: 'input', label: 'Other…' },
      { id: 'open', label: 'Open DSH' }
    ],
    { timeoutMs: 25_000 }
  )
  assert.equal(plan.mode, 'gdbus')
  assert.ok(plan.args.includes('25000'))
  assert.ok(plan.args.some((arg) => String(arg).includes('"input"')))
})

test('Linux gdbus command carries actions when click is enabled', () => {
  const { config, rendered } = fixture()
  const plan = buildLinuxNotification(rendered, config, linuxCapabilities(), { pkgDir })
  assert.equal(plan.mode, 'gdbus')
  assert.equal(plan.clickable, true)
  assert.ok(plan.args.includes('org.freedesktop.Notifications.Notify'))
  assert.ok(plan.args.includes('["default","打开 DSH"]') || plan.args.includes('["default","Open DSH"]'))
  assert.ok(plan.args.some((arg) => arg.includes('icon.png')))
  assert.ok(plan.args.includes('12000'))
})

test('Linux notify-send fallback is used without gdbus', () => {
  const { config, rendered } = fixture()
  const capabilities = linuxCapabilities({ commands: { notifySend: '/usr/bin/notify-send' } })
  const plan = buildLinuxNotification(rendered, config, capabilities, { pkgDir })
  assert.equal(plan.mode, 'notify-send')
  assert.equal(plan.clickable, false)
  assert.ok(plan.args.includes('-u'))
  assert.ok(plan.args.includes('critical'))
})

test('Linux sound commands use paplay volume and reject non-WAV with aplay', () => {
  const config = normalizeConfig({ sound: { normal: 'chime', volume: 80 } })
  const sound = resolveSound(config, 'normal', { pkgDir, platform: 'linux' })
  const plan = buildLinuxSoundCommand(config, sound, linuxCapabilities(), { pkgDir })
  assert.equal(plan.command, '/usr/bin/paplay')
  assert.ok(plan.args.includes('--volume=52429'))

  const oggSound = { kind: 'system', path: '/usr/share/sounds/freedesktop/stereo/complete.oga' }
  const aplayOnly = linuxCapabilities({ commands: { aplay: '/usr/bin/aplay' } })
  const fallback = buildLinuxSoundCommand(config, oggSound, aplayOnly, { pkgDir })
  assert.equal(fallback.command, '/usr/bin/aplay')
  assert.ok(fallback.args.some((arg) => arg.endsWith('chime.wav')))
})

test('gdbus notification ids are parsed from common outputs', () => {
  assert.equal(parseGdbusNotificationId('(uint32 42,)\n'), 42)
  assert.equal(parseGdbusNotificationId('(uint32 7)'), 7)
  assert.equal(parseGdbusNotificationId('garbage'), null)
})

test('dry-run does not spawn and returns the built payload', async () => {
  const { config, rendered } = fixture()
  let spawns = 0
  const notifier = createNotifier({
    platform: 'win32',
    capabilities: winCapabilities(),
    pkgDir,
    env: { DSH_SYSTEM_NOTIFY_DRY_RUN: '1' },
    spawnImpl: () => { spawns += 1; throw new Error('must not spawn') }
  })
  const result = await notifier.send(rendered, config, { wait: true })
  assert.equal(result.ok, true)
  assert.equal(result.dryRun, true)
  assert.equal(spawns, 0)
  assert.ok(result.payload.title.length > 0)
  notifier.dispose()
})

test('Windows send waits for the PowerShell helper and passes payload through env', async () => {
  const { config, rendered } = fixture()
  const calls = []
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setImmediate(() => child.emit('close', 0))
    return child
  }
  const notifier = createNotifier({
    platform: 'win32',
    capabilities: winCapabilities(),
    pkgDir,
    env: {},
    spawnImpl
  })
  const result = await notifier.send(rendered, config, { wait: true })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.ok(calls[0].args.some((arg) => arg.endsWith('win-toast.ps1')))
  assert.equal(calls[0].args.includes('-PayloadFile'), false)
  const payload = JSON.parse(calls[0].options.env.DSH_NOTIFY_PAYLOAD)
  assert.equal(payload.title.length > 0, true)
  assert.equal(payload.appId, 'com.deepseek.dsh')
  assert.ok(payload.playFile.endsWith('alert.wav'))
  notifier.dispose()
})

test('Linux sound-only delivery skips the notification and plays the sound', async () => {
  const { config, rendered } = fixture({
    delivery: 'sound',
    sound: { normal: 'chime', error: 'chime' }
  })
  const calls = []
  const spawnImpl = (command, args) => {
    calls.push({ command, args })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setImmediate(() => child.emit('close', 0))
    return child
  }
  const notifier = createNotifier({
    platform: 'linux',
    capabilities: linuxCapabilities(),
    pkgDir,
    env: {},
    spawnImpl,
    logger: () => {}
  })
  const result = await notifier.send(rendered, config, { wait: false })
  assert.equal(result.ok, true)
  assert.equal(result.backend, 'linux-sound')
  assert.equal(calls.some((call) => call.command === '/usr/bin/gdbus'), false)
  assert.ok(calls.some((call) => call.command === '/usr/bin/paplay'))
  notifier.dispose()
})

test('Linux send parses the notification id and arms the click monitor', async () => {
  const { config, rendered } = fixture()
  const calls = []
  const spawnImpl = (command, args) => {
    calls.push({ command, args })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setImmediate(() => {
      if (command === '/usr/bin/gdbus') {
        child.stdout.emit('data', '(uint32 91,)\n')
        child.emit('close', 0)
      }
    })
    return child
  }
  const notifier = createNotifier({
    platform: 'linux',
    capabilities: linuxCapabilities(),
    pkgDir,
    env: {},
    spawnImpl,
    logger: () => {}
  })
  const result = await notifier.send(rendered, config, { wait: false })
  assert.equal(result.ok, true)
  assert.equal(result.notificationId, 91)
  assert.ok(calls.some((call) => call.command === '/usr/bin/gdbus'))
  assert.ok(calls.some((call) => call.command === '/usr/bin/dbus-monitor'))
  notifier.dispose()
})
