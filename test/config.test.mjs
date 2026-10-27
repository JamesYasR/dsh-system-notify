import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DEFAULT_CONFIG,
  configPath,
  inQuietHours,
  loadConfig,
  normalizeConfig,
  saveConfig
} from '../lib/config.mjs'

test('defaults are complete and valid', () => {
  const config = normalizeConfig(undefined)
  assert.equal(config.enabled, true)
  assert.equal(config.style, 'standard')
  assert.equal(config.sound.enabled, true)
  assert.equal(config.sound.volume, 80)
  assert.equal(config.click.enabled, true)
  assert.equal(config.click.url, 'dsh://open')
  assert.equal(config.windows.appId, 'com.deepseek.dsh')
  assert.equal(config.interactive.enabled, true)
  assert.equal(config.interactive.timeoutSec, 20)
  assert.equal(config.sound.customNormalPath, '')
  assert.equal(Object.keys(config.events).length, 11)
  assert.deepEqual(Object.keys(config.include).sort(), [
    'duration',
    'sessionId',
    'sessionTitle',
    'summary',
    'workspace'
  ])
})

test('normalisation drops unknown keys and clamps numbers', () => {
  const config = normalizeConfig({
    unknown: 'drop me',
    style: 'nope',
    delivery: 'nope',
    sound: { volume: 999, normal: 'nope' },
    quietHours: { enabled: true, start: '25:99', end: '08:00' },
    minDurationSec: -5,
    cooldownSec: 99999,
    summaryMaxChars: 1,
    include: { bogus: true, summary: false },
    click: { url: 'file:///etc/passwd' },
    events: { turnComplete: 'yes', turnError: false, bogus: true }
  })
  assert.equal(config.style, 'standard')
  assert.equal(config.delivery, 'both')
  assert.equal(config.sound.volume, 100)
  assert.equal(config.sound.normal, 'system')
  assert.equal(config.quietHours.start, '22:00')
  assert.equal(config.minDurationSec, 0)
  assert.equal(config.cooldownSec, 3600)
  assert.equal(config.summaryMaxChars, 40)
  assert.equal(config.include.summary, false)
  assert.equal(config.include.bogus, undefined)
  assert.equal(config.click.url, 'dsh://open')
  assert.equal(config.events.turnComplete, true)
  assert.equal(config.events.turnError, false)
  assert.equal(config.events.bogus, undefined)
})

test('custom click URLs must use an allowed scheme', () => {
  assert.equal(normalizeConfig({ click: { url: 'https://127.0.0.1:51625/' } }).click.url, 'https://127.0.0.1:51625/')
  assert.equal(normalizeConfig({ click: { url: 'dsh://open' } }).click.url, 'dsh://open')
  assert.equal(normalizeConfig({ click: { url: 'javascript:alert(1)//' } }).click.url, DEFAULT_CONFIG.click.url)
  assert.equal(normalizeConfig({ click: { url: 'ms-msdt://whatever' } }).click.url, DEFAULT_CONFIG.click.url)
  assert.equal(normalizeConfig({ click: { url: 'file:///etc/passwd' } }).click.url, DEFAULT_CONFIG.click.url)
  assert.equal(normalizeConfig({ click: { url: 'not a url' } }).click.url, DEFAULT_CONFIG.click.url)
})

test('quiet hours handle day and overnight windows', () => {
  const at = (hour, minute = 0) => new Date(2026, 0, 1, hour, minute)
  const overnight = { enabled: true, start: '22:00', end: '08:00', allowCritical: true }
  assert.equal(inQuietHours(overnight, at(23)), true)
  assert.equal(inQuietHours(overnight, at(3)), true)
  assert.equal(inQuietHours(overnight, at(8)), false)
  assert.equal(inQuietHours(overnight, at(21, 59)), false)
  const daytime = { enabled: true, start: '09:00', end: '17:00', allowCritical: true }
  assert.equal(inQuietHours(daytime, at(12)), true)
  assert.equal(inQuietHours(daytime, at(17)), false)
  assert.equal(inQuietHours({ enabled: false, start: '09:00', end: '17:00' }, at(12)), false)
  assert.equal(inQuietHours({ enabled: true, start: '10:00', end: '10:00' }, at(10)), false)
})

test('config path honours DSH_SYSTEM_NOTIFY_CONFIG and platform defaults', () => {
  assert.equal(
    configPath('linux', { HOME: '/home/me', XDG_CONFIG_HOME: '/tmp/xdg' }),
    path.posix.join('/tmp/xdg', 'dsh-system-notify', 'config.json')
  )
  assert.equal(
    configPath('linux', { HOME: '/home/me' }),
    path.posix.join(os.homedir(), '.config', 'dsh-system-notify', 'config.json')
  )
  assert.equal(
    configPath('win32', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }),
    path.win32.join('C:\\Users\\me\\AppData\\Roaming', 'dsh-system-notify', 'config.json')
  )
  assert.equal(
    configPath('linux', { DSH_SYSTEM_NOTIFY_CONFIG: '/tmp/custom.json' }),
    '/tmp/custom.json'
  )
})

test('load/save round trip and malformed-file fallback', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-notify-config-'))
  const file = path.join(directory, 'config.json')
  try {
    const missing = loadConfig(file)
    assert.equal(missing.error, undefined)
    assert.equal(missing.config.style, 'standard')

    const saved = saveConfig({ style: 'privacy', sound: { enabled: false } }, file)
    assert.equal(saved.style, 'privacy')
    assert.equal(saved.sound.enabled, false)
    const reloaded = loadConfig(file)
    assert.equal(reloaded.config.style, 'privacy')
    assert.equal(reloaded.config.sound.enabled, false)

    fs.writeFileSync(file, '\uFEFF{"style":"simple"}', 'utf8')
    const withBom = loadConfig(file)
    assert.equal(withBom.error, undefined)
    assert.equal(withBom.config.style, 'simple')

    fs.writeFileSync(file, '{ not json', 'utf8')
    const broken = loadConfig(file)
    assert.ok(broken.error)
    assert.equal(broken.config.style, 'standard')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
