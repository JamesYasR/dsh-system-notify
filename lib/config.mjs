/**
 * Configuration schema, defaults, validation and persistence for
 * dsh-system-notify.
 *
 * The config is intentionally a plain JSON document (no DSH Settings
 * namespace) so it survives plugin reinstalls and can be edited by hand or by
 * the bundled settings page. Every value is normalised on read and on save;
 * unknown keys are dropped so a stale UI can never inject junk.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const CONFIG_VERSION = 1

export const STYLES = ['privacy', 'simple', 'standard', 'detailed']
export const SOUND_NAMES = ['none', 'system', 'chime', 'alert', 'custom']
export const DELIVERIES = ['both', 'toast', 'sound']
export const EVENT_KEYS = [
  'turnComplete',
  'turnError',
  'turnBlocked',
  'turnMaxTokens',
  'turnAborted',
  'needsInput',
  'approvalRequest',
  'goalComplete',
  'goalBlocked',
  'subagentComplete',
  'workflowComplete'
]

export const DEFAULT_CONFIG = deepFreeze({
  version: CONFIG_VERSION,
  enabled: true,
  events: {
    turnComplete: true,
    turnError: true,
    turnBlocked: true,
    turnMaxTokens: true,
    turnAborted: false,
    needsInput: true,
    approvalRequest: true,
    goalComplete: true,
    goalBlocked: true,
    subagentComplete: false,
    workflowComplete: false
  },
  style: 'standard',
  language: 'auto',
  sound: {
    enabled: true,
    normal: 'system',
    error: 'alert',
    customPath: '',
    volume: 80
  },
  delivery: 'both',
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
    allowCritical: true
  },
  minDurationSec: 0,
  cooldownSec: 10,
  include: {
    sessionTitle: true,
    summary: true,
    workspace: true,
    duration: true,
    sessionId: false
  },
  summaryMaxChars: 140,
  ignoreSubagentSessions: true,
  click: {
    enabled: true,
    url: 'dsh://open',
    focusWindowTitle: 'DeepSeek Harness',
    openFallback: true
  },
  appName: 'DeepSeek Harness',
  windows: {
    appId: 'com.deepseek.dsh'
  },
  iconPath: '',
  agentTool: false
})

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function numberInRange(value, min, max, fallback) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function integerInRange(value, min, max, fallback) {
  return Math.round(numberInRange(value, min, max, fallback))
}

function cleanString(value, fallback = '', maxLength = 1024) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** A safe, normalised configuration for any partially valid input. */
export function normalizeConfig(raw) {
  const source = isRecord(raw) ? raw : {}
  const defaults = DEFAULT_CONFIG
  const events = isRecord(source.events) ? source.events : {}
  const sound = isRecord(source.sound) ? source.sound : {}
  const quietHours = isRecord(source.quietHours) ? source.quietHours : {}
  const include = isRecord(source.include) ? source.include : {}
  const click = isRecord(source.click) ? source.click : {}
  const windows = isRecord(source.windows) ? source.windows : {}

  const config = {
    version: CONFIG_VERSION,
    enabled: bool(source.enabled, defaults.enabled),
    events: {},
    style: pickEnum(source.style, STYLES, defaults.style),
    language: pickEnum(source.language, ['auto', 'zh', 'en'], defaults.language),
    sound: {
      enabled: bool(sound.enabled, defaults.sound.enabled),
      normal: pickEnum(sound.normal, SOUND_NAMES, defaults.sound.normal),
      error: pickEnum(sound.error, SOUND_NAMES, defaults.sound.error),
      customPath: cleanString(sound.customPath, defaults.sound.customPath, 2048),
      volume: integerInRange(sound.volume, 0, 100, defaults.sound.volume)
    },
    delivery: pickEnum(source.delivery, DELIVERIES, defaults.delivery),
    quietHours: {
      enabled: bool(quietHours.enabled, defaults.quietHours.enabled),
      start: TIME_PATTERN.test(quietHours.start) ? quietHours.start : defaults.quietHours.start,
      end: TIME_PATTERN.test(quietHours.end) ? quietHours.end : defaults.quietHours.end,
      allowCritical: bool(quietHours.allowCritical, defaults.quietHours.allowCritical)
    },
    minDurationSec: integerInRange(source.minDurationSec, 0, 24 * 60 * 60, defaults.minDurationSec),
    cooldownSec: integerInRange(source.cooldownSec, 0, 3600, defaults.cooldownSec),
    include: {
      sessionTitle: bool(include.sessionTitle, defaults.include.sessionTitle),
      summary: bool(include.summary, defaults.include.summary),
      workspace: bool(include.workspace, defaults.include.workspace),
      duration: bool(include.duration, defaults.include.duration),
      sessionId: bool(include.sessionId, defaults.include.sessionId)
    },
    summaryMaxChars: integerInRange(source.summaryMaxChars, 40, 500, defaults.summaryMaxChars),
    ignoreSubagentSessions: bool(
      source.ignoreSubagentSessions,
      defaults.ignoreSubagentSessions
    ),
    click: {
      enabled: bool(click.enabled, defaults.click.enabled),
      url: normalizeClickUrl(click.url, defaults.click.url),
      focusWindowTitle: cleanString(
        click.focusWindowTitle,
        defaults.click.focusWindowTitle,
        200
      ) || defaults.click.focusWindowTitle,
      openFallback: bool(click.openFallback, defaults.click.openFallback)
    },
    appName: cleanString(source.appName, defaults.appName, 80) || defaults.appName,
    windows: {
      appId: cleanString(windows.appId, defaults.windows.appId, 200) || defaults.windows.appId
    },
    iconPath: cleanString(source.iconPath, defaults.iconPath, 2048),
    agentTool: bool(source.agentTool, defaults.agentTool)
  }

  for (const key of EVENT_KEYS) {
    config.events[key] = bool(events[key], defaults.events[key])
  }
  return config
}

export const CLICK_URL_SCHEMES = ['http', 'https', 'dsh']

/** Accept only the schemes the click action is designed to open. */
export function normalizeClickUrl(value, fallback = DEFAULT_CONFIG.click.url) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+$/u.test(trimmed)) return fallback
  const scheme = trimmed.slice(0, trimmed.indexOf(':')).toLowerCase()
  if (!CLICK_URL_SCHEMES.includes(scheme)) return fallback
  return trimmed
}

function pathFor(platform) {
  return platform === 'win32' ? path.win32 : path.posix
}

/** Directory that owns the plugin's persistent config. */
export function configDirectory(platform = process.platform, env = process.env) {
  const platformPath = pathFor(platform)
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return platformPath.join(appData, 'dsh-system-notify')
  }
  const xdg = env.XDG_CONFIG_HOME
  const base = xdg && xdg.trim() ? xdg : platformPath.join(os.homedir(), '.config')
  return platformPath.join(base, 'dsh-system-notify')
}

export function configPath(platform = process.platform, env = process.env) {
  const platformPath = pathFor(platform)
  const override = env.DSH_SYSTEM_NOTIFY_CONFIG
  if (override && override.trim()) return platformPath.resolve(override.trim())
  return platformPath.join(configDirectory(platform, env), 'config.json')
}

/**
 * Read the config file. A missing file is a normal first run; a malformed file
 * yields defaults plus a warning instead of crashing the Host.
 */
export function loadConfig(pathToFile = configPath()) {
  try {
    const raw = fs.readFileSync(pathToFile, 'utf8').replace(/^\uFEFF/u, '')
    const parsed = JSON.parse(raw)
    return { config: normalizeConfig(parsed), error: undefined, path: pathToFile }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { config: normalizeConfig(undefined), error: undefined, path: pathToFile }
    }
    return {
      config: normalizeConfig(undefined),
      error: error instanceof Error ? error.message : String(error),
      path: pathToFile
    }
  }
}

/** Atomically persist a config (temp file + rename, 0600 where supported). */
export function saveConfig(config, pathToFile = configPath()) {
  const normalized = normalizeConfig(config)
  fs.mkdirSync(path.dirname(pathToFile), { recursive: true, mode: 0o700 })
  const temporary = `${pathToFile}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  fs.renameSync(temporary, pathToFile)
  try {
    fs.chmodSync(pathToFile, 0o600)
  } catch {
    // Windows does not expose POSIX modes; the file still lives in the user profile.
  }
  return normalized
}

/** Parse "HH:MM" into minutes since midnight; invalid input returns null. */
export function parseClock(text) {
  if (typeof text !== 'string' || !TIME_PATTERN.test(text)) return null
  const [hour, minute] = text.split(':').map(Number)
  return hour * 60 + minute
}

/** True when `date` falls inside the (possibly overnight) quiet-hours window. */
export function inQuietHours(quietHours, date = new Date()) {
  if (!quietHours || quietHours.enabled !== true) return false
  const start = parseClock(quietHours.start)
  const end = parseClock(quietHours.end)
  if (start === null || end === null) return false
  if (start === end) return false
  const current = date.getHours() * 60 + date.getMinutes()
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}
