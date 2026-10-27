import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { normalizeConfig } from '../lib/config.mjs'
import { renderNotification } from '../lib/format.mjs'
import {
  buildLinuxNotification,
  buildLinuxSoundCommand,
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
  assert.equal(payload.silent, false)
  assert.ok(String(payload.audio).endsWith('alert.wav'))
  assert.equal(payload.duration, 'long')
  assert.equal(payload.clickEnabled, true)
  assert.equal(payload.clickUrl, 'dsh://open')
  assert.ok(payload.iconUri.startsWith('file:///'))
  assert.equal(payload.lines.length, 3)

  const systemError = fixture({ sound: { error: 'system' } })
  const systemPayload = buildWindowsPayload(systemError.rendered, systemError.config, winCapabilities(), {
    pkgDir
  })
  assert.equal(systemPayload.audio, 'ms-winsoundevent:Notification.Reminder')
})

test('Windows payload can be silent, toast-only or sound-only', () => {
  const normal = fixture({ sound: { enabled: false } })
  const silent = buildWindowsPayload(normal.rendered, normal.config, winCapabilities(), { pkgDir })
  assert.equal(silent.silent, true)
  assert.equal(silent.audio, null)

  const toastOnly = fixture({ delivery: 'toast', sound: { normal: 'chime', error: 'chime' } })
  const toastPayload = buildWindowsPayload(toastOnly.rendered, toastOnly.config, winCapabilities(), { pkgDir })
  assert.equal(toastPayload.toast, true)
  assert.equal(toastPayload.silent, true)
  assert.equal(toastPayload.audio, null)

  const bothChime = fixture({ sound: { normal: 'chime', error: 'chime' } })
  const chimePayload = buildWindowsPayload(bothChime.rendered, bothChime.config, winCapabilities(), { pkgDir })
  assert.ok(String(chimePayload.audio).startsWith('file:///'))
  assert.ok(String(chimePayload.audio).endsWith('chime.wav'))

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

test('Windows send waits for the PowerShell helper', async () => {
  const { config, rendered } = fixture()
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
  assert.ok(calls[0].args.includes('-PayloadFile'))
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
