/**
 * dsh-system-notify — Codex-style desktop notifications for DeepSeek Harness.
 *
 * Host half: listens to session/goal/interaction events, renders notifications
 * according to the user's style/privacy settings, and delivers them through the
 * platform backend (Windows WinRT toast + PowerShell, Linux libnotify/gdbus,
 * macOS osascript). It also mounts two same-origin HTTP routes that the client
 * settings page uses, and optionally registers an agent-facing notify tool.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_CONFIG,
  STYLES,
  configPath as resolveConfigPath,
  loadConfig,
  normalizeConfig,
  saveConfig as persistConfig
} from './lib/config.mjs'
import { renderNotification, sampleEvent } from './lib/format.mjs'
import { resolveLanguage } from './lib/i18n.mjs'
import { createEventCollector } from './lib/events.mjs'
import { createInteractiveManager } from './lib/interactive.mjs'
import { createNotifier } from './lib/notify.mjs'
import { detectCapabilities, resolveIconPath } from './lib/platform.mjs'
import { mountRoutes } from './lib/routes.mjs'
import { buildAgentTool } from './lib/tool.mjs'
import { ensureWindowsProtocol, removeWindowsProtocol } from './lib/win-protocol.mjs'
import { saveSoundUpload } from './lib/sound-upload.mjs'

export const name = 'dsh-system-notify'

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const PLATFORM = process.platform
const VERSION = '1.1.0'

function publicCapabilities(capabilities, iconAvailable) {
  const view = {
    platform: capabilities.platform,
    toast: { available: Boolean(capabilities.toast.available), backend: capabilities.toast.backend },
    sound: { available: Boolean(capabilities.sound.available), backend: capabilities.sound.backend },
    click: { available: Boolean(capabilities.click.available), backend: capabilities.click.backend },
    notes: Array.isArray(capabilities.notes) ? capabilities.notes.slice(0, 12) : [],
    iconAvailable: Boolean(iconAvailable)
  }
  return view
}

export function apply(ctx) {
  const configFile = resolveConfigPath(PLATFORM, process.env)
  const loaded = loadConfig(configFile)
  const state = {
    config: loaded.config,
    configPath: configFile,
    loadError: loaded.error,
    toolDispose: undefined,
    toolsContext: undefined,
    protocolReady: false
  }

  const logger = createLogger(ctx)
  if (loaded.error) {
    logger(`config could not be parsed, using defaults: ${loaded.error}`)
  }

  const capabilities = detectCapabilities({
    platform: PLATFORM,
    env: process.env,
    pkgDir: PACKAGE_DIR,
    configPath: configFile,
    iconPath: state.config.iconPath,
    appName: state.config.appName
  })

  const notifier = createNotifier({
    platform: PLATFORM,
    capabilities,
    pkgDir: PACKAGE_DIR,
    env: process.env,
    logger
  })

  function service(key) {
    try {
      const value = ctx.get(key)
      return value === undefined ? undefined : value
    } catch {
      return undefined
    }
  }

  function currentConfig() {
    return state.config
  }

  function getOrigin() {
    try {
      const webServer = service('webServer')
      if (webServer && typeof webServer.getOrigin === 'function') return webServer.getOrigin()
    } catch {
      // fall through
    }
    try {
      const webApp = service('webApp')
      if (webApp && typeof webApp.getAdvertisedUrl === 'function') return webApp.getAdvertisedUrl()
    } catch {
      // ignore
    }
    return undefined
  }

  function syncWindowsProtocol() {
    if (PLATFORM !== 'win32') return
    const wanted = state.config.interactive && state.config.interactive.enabled === true
    if (wanted) {
      const ok = ensureWindowsProtocol({
        pkgDir: PACKAGE_DIR,
        powershellPath: capabilities.commands.powershell,
        iconPath: resolveIconPath(PACKAGE_DIR, state.config.iconPath)
      })
      state.protocolReady = ok
      if (!ok) logger('could not register the dsh-system-notify:// action protocol')
    } else if (state.protocolReady) {
      removeWindowsProtocol()
      state.protocolReady = false
    }
  }

  function deliver(event) {
    try {
      if (state.config.enabled !== true) return
      const rendered = renderNotification(event, state.config, { env: process.env })
      void notifier.send(rendered, state.config).then((result) => {
        if (result && result.ok === false && result.error) {
          logger(`notification delivery failed (${result.error})`)
        }
      }).catch((error) => {
        logger(`notification delivery rejected: ${error instanceof Error ? error.message : error}`)
      })
    } catch (error) {
      logger(`notification render failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function notifyCustom(input) {
    const config = state.config
    if (config.enabled !== true) return { delivered: false, platform: PLATFORM }
    const language = resolveLanguage(config.language, process.env)
    const event = {
      kind: 'custom',
      sessionId: input.sessionId,
      custom: {
        title: input.title,
        body: input.body
      },
      summary: input.body
    }
    const rendered = renderNotification(event, config, { env: process.env })
    if (input.urgent === true) {
      rendered.urgency = 'critical'
      rendered.soundKind = 'error'
    }
    if (!rendered.title) {
      rendered.title = language === 'zh' ? '通知' : 'Notification'
    }
    void notifier.send(rendered, config).catch((error) => {
      logger(`agent notification failed: ${error instanceof Error ? error.message : error}`)
    })
    return { delivered: true, platform: PLATFORM }
  }

  const collector = createEventCollector({
    getConfig: currentConfig,
    send: deliver,
    getSessionTitle: () => service('sessionTitle'),
    getSessionById: (id) => {
      const sessions = service('sessions')
      if (!sessions || typeof sessions.get !== 'function') return undefined
      try {
        return sessions.get(id)
      } catch {
        return undefined
      }
    },
    logger
  })

  const interactive = createInteractiveManager({
    getConfig: currentConfig,
    notifier,
    platform: PLATFORM,
    getOrigin,
    describeAgent: (agent) => collector.describeAgent(agent),
    fallbackApproval: (request) => collector.handleApproval(request),
    fallbackQuestion: (request) => collector.handleNeedsInput(request),
    isWindowsProtocolReady: () => state.protocolReady,
    logger
  })
  syncWindowsProtocol()

  ctx.on('session/event', (session, event) => collector.handleSessionEvent(session, event), {
    global: true
  })
  ctx.on('session/disposed', (session) => {
    collector.resetSession(session && session.id)
  }, { global: true })
  ctx.on('goal/changed', (payload) => collector.handleGoalChanged(payload), { global: true })
  ctx.on('user-questions/request', (request, next) => {
    try {
      const handled = interactive.handleQuestion(request, next)
      if (handled) return handled
      collector.handleNeedsInput(request)
    } catch (error) {
      logger(`question notification failed: ${error instanceof Error ? error.message : error}`)
    }
    return next()
  }, { global: true, prepend: true })
  ctx.on('approval/request', (request, next) => {
    try {
      const handled = interactive.handleApproval(request, next)
      if (handled) return handled
      collector.handleApproval(request)
    } catch (error) {
      logger(`approval notification failed: ${error instanceof Error ? error.message : error}`)
    }
    return next()
  }, { global: true, prepend: true })
  ctx.on('subagent/end', (info) => collector.handleSubagentEnd(info), { global: true })
  ctx.on('workflow/end', (info, result) => collector.handleWorkflowEnd(info, result), {
    global: true
  })

  function syncAgentTool() {
    const toolsContext = state.toolsContext
    if (!toolsContext || !toolsContext.tools || typeof toolsContext.tools.register !== 'function') return
    const wanted = state.config.agentTool === true
    if (wanted && state.toolDispose === undefined) {
      try {
        state.toolDispose = toolsContext.tools.register(
          buildAgentTool({
            getConfig: currentConfig,
            notifyCustom,
            logger
          })
        )
      } catch (error) {
        logger(`could not register send_desktop_notification: ${error instanceof Error ? error.message : error}`)
      }
    } else if (!wanted && typeof state.toolDispose === 'function') {
      try { state.toolDispose() } catch { /* unloaded */ }
      state.toolDispose = undefined
    }
  }

  ctx.inject(['tools'], (toolsContext) => {
    state.toolsContext = toolsContext
    toolsContext.effect(() => {
      syncAgentTool()
      return () => {
        if (typeof state.toolDispose === 'function') {
          try { state.toolDispose() } catch { /* unloaded */ }
        }
        state.toolDispose = undefined
        state.toolsContext = undefined
      }
    }, 'dsh-system-notify: agent tool')
  })

  function clientBundleStatus() {
    const modules = service('clientModules')
    if (!modules || typeof modules.clientPath !== 'function') return { registered: false }
    try {
      const bundle = modules.clientPath('dsh-system-notify')
      return { registered: Boolean(bundle) }
    } catch {
      return { registered: false }
    }
  }

  function snapshot(configOverride) {
    const config = configOverride || state.config
    const language = resolveLanguage(config.language, process.env)
    const styleSamples = {}
    for (const style of STYLES) {
      const rendered = renderNotification(sampleEvent(language), { ...config, style }, { env: process.env })
      styleSamples[style] = {
        title: rendered.title,
        lines: rendered.lines,
        urgency: rendered.urgency
      }
    }
    return {
      config,
      defaults: DEFAULT_CONFIG,
      version: VERSION,
      platform: PLATFORM,
      configPath: state.configPath,
      loadError: state.loadError,
      capabilities: publicCapabilities(capabilities, resolveIconPath(PACKAGE_DIR, config.iconPath)),
      styleSamples,
      client: clientBundleStatus(),
      interactive: {
        available: interactive.canInteract(),
        protocolReady: state.protocolReady
      }
    }
  }

  function save(nextConfig) {
    const normalized = normalizeConfig(nextConfig)
    const saved = persistConfig(normalized, state.configPath)
    state.config = saved
    state.loadError = undefined
    capabilities.iconPath = resolveIconPath(PACKAGE_DIR, saved.iconPath)
    capabilities.appName = saved.appName
    syncAgentTool()
    syncWindowsProtocol()
    return saved
  }

  async function testNotification(input = {}) {
    let base = state.config
    if (input.config && typeof input.config === 'object') {
      try {
        base = normalizeConfig(input.config)
      } catch {
        base = state.config
      }
    }
    const style = STYLES.includes(input.style) ? input.style : base.style
    const config = { ...base, enabled: true, style }
    if (input.kind === 'sound') {
      const soundKind = input.sound === 'error' ? 'error' : 'normal'
      const result = await notifier.playSound(config, soundKind, { wait: true })
      return { ...result, preview: null, style: config.style }
    }
    const language = resolveLanguage(config.language, process.env)
    const event = sampleEvent(language)
    const rendered = renderNotification(event, config, { env: process.env })
    const result = await notifier.send(rendered, config, { wait: true })
    return {
      ...result,
      style: config.style,
      preview: {
        title: rendered.title,
        lines: rendered.lines,
        urgency: rendered.urgency,
        language
      }
    }
  }

  function saveSound(input) {
    return saveSoundUpload({
      kind: input && input.kind,
      data: input && input.data,
      name: input && input.name,
      configPath: state.configPath,
      platform: PLATFORM
    })
  }

  ctx.inject(['webServer'], (webContext) => {
    webContext.effect(
      () =>
        mountRoutes({
          webServer: webContext.webServer,
          getSnapshot: (configOverride) => snapshot(configOverride),
          saveConfig: save,
          testNotification,
          saveSound,
          resolveInteraction: (input) => interactive.resolve(input.id, input.token, input.action, input.value),
          interactionMeta: (id, token) => interactive.meta(id, token)
        }),
      'dsh-system-notify: settings routes'
    )
  })

  ctx.effect(() => () => {
    interactive.dispose()
    collector.dispose()
    notifier.dispose()
    if (state.protocolReady) {
      removeWindowsProtocol()
      state.protocolReady = false
    }
  }, 'dsh-system-notify: lifecycle')

  if (logger && state.config.enabled) {
    logger(
      `ready on ${PLATFORM}: toast=${capabilities.toast.backend}, sound=${capabilities.sound.backend}, click=${capabilities.click.backend}`
    )
  }
}

function createLogger(ctx) {
  return (...args) => {
    try {
      if (typeof ctx.logger === 'function') {
        const instance = ctx.logger('dsh-system-notify')
        if (instance && typeof instance.warn === 'function') {
          instance.warn(args.join(' '))
          return
        }
        if (typeof instance === 'function') {
          instance(args.join(' '))
          return
        }
      }
    } catch {
      // fall through to console
    }
    // eslint-disable-next-line no-console
    console.warn('[dsh-system-notify]', ...args)
  }
}
