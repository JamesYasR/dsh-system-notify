/**
 * Event collection and notification policy.
 *
 * Listens to DSH session/goal events, keeps a tiny per-session turn context,
 * applies the user's event selection, quiet hours, minimum turn duration,
 * cooldown and duplicate-suppression rules, then hands a plain event object to
 * the renderer/delivery layer.
 *
 * Kept free of Harness imports so it can be driven by fake sessions in tests.
 */

import { inQuietHours } from './config.mjs'
import { isCriticalKind } from './format.mjs'
import { resolveLanguage } from './i18n.mjs'

const TURN_KINDS = {
  completed: 'turnComplete',
  error: 'turnError',
  blocked: 'turnBlocked',
  'max-tokens': 'turnMaxTokens',
  aborted: 'turnAborted',
  interrupted: 'turnAborted'
}

const EVENT_FLAG = {
  turnComplete: 'turnComplete',
  turnError: 'turnError',
  turnBlocked: 'turnBlocked',
  turnMaxTokens: 'turnMaxTokens',
  turnAborted: 'turnAborted',
  needsInput: 'needsInput',
  approvalRequest: 'approvalRequest',
  goalComplete: 'goalComplete',
  goalBlocked: 'goalBlocked',
  subagentComplete: 'subagentComplete',
  workflowComplete: 'workflowComplete'
}

const MAX_SESSIONS = 400
const DEDUPE_BLOCK_AFTER_QUESTION_MS = 60_000
const DEDUPE_TURN_AFTER_GOAL_MS = 8_000

function boundedSet(map, key, value) {
  map.delete(key)
  map.set(key, value)
  while (map.size > MAX_SESSIONS) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

function contentText(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join(' ').replace(/\s+/gu, ' ').trim()
}

function messageText(message) {
  return contentText(message && message.content)
}

function clampText(value, max = 200) {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
  const characters = Array.from(text)
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join('')}…`
}

/**
 * Create the event collector.
 *
 * @param {object} options
 * @param {() => object} options.getConfig returns the live normalised config
 * @param {(event: object) => void} options.send hands a notification event to the renderer
 * @param {() => any} [options.getSessionTitle] optional DSH sessionTitle service
 * @param {(id: string) => any} [options.getSessionById] optional sessions service lookup
 * @param {(message: string) => void} [options.logger]
 * @param {() => number} [options.now]
 */
export function createEventCollector(options = {}) {
  const getConfig = options.getConfig || (() => ({ enabled: false, events: {} }))
  const send = typeof options.send === 'function' ? options.send : () => {}
  const getSessionTitle = options.getSessionTitle || (() => undefined)
  const getSessionById = options.getSessionById || (() => undefined)
  const logger = typeof options.logger === 'function' ? options.logger : () => {}
  const now = typeof options.now === 'function' ? options.now : () => Date.now()

  /** @type {Map<string, {turn:number, startedAt:number, lastText:string, toolError:string}>} */
  const turns = new Map()
  /** @type {Map<string, string>} */
  const firstUserText = new Map()
  /** @type {Map<string, number>} */
  const lastSent = new Map()
  /** @type {Map<string, number>} */
  const lastQuestion = new Map()
  /** @type {Map<string, number>} */
  const lastGoal = new Map()

  function config() {
    try {
      return getConfig() || { enabled: false, events: {} }
    } catch {
      return { enabled: false, events: {} }
    }
  }

  function sessionIdOf(sessionOrAgent) {
    if (!sessionOrAgent) return ''
    const id = sessionOrAgent.id
    return typeof id === 'string' ? id : ''
  }

  function titleFor(session, sessionId) {
    try {
      const service = getSessionTitle()
      const snapshot = service && session ? service.get(session) : undefined
      if (snapshot && typeof snapshot.title === 'string' && snapshot.title.trim()) {
        return snapshot.title.trim()
      }
    } catch {
      // title service is optional
    }
    const fallback = firstUserText.get(sessionId)
    return fallback ? clampText(fallback, 60) : ''
  }

  function resolveSession(agent, fallbackId) {
    if (agent && agent.session) return agent.session
    const id = fallbackId || sessionIdOf(agent)
    if (!id) return undefined
    try {
      return getSessionById(id)
    } catch {
      return undefined
    }
  }

  function sessionMeta(session, sessionId) {
    const cwd = session && session.header && typeof session.header.cwd === 'string'
      ? session.header.cwd
      : ''
    const origin = session && session.header ? session.header.origin : undefined
    return {
      id: sessionId,
      title: titleFor(session, sessionId),
      cwd,
      isSubagent: origin === 'subagent'
    }
  }

  function eventEnabled(kind) {
    const current = config()
    if (current.enabled !== true) return false
    const flag = EVENT_FLAG[kind]
    if (!flag) return true
    return Boolean(current.events && current.events[flag])
  }

  function cooldownAllows(key, cfg) {
    const seconds = Number(cfg.cooldownSec) || 0
    if (seconds <= 0) return true
    const previous = lastSent.get(key)
    return previous === undefined || now() - previous >= seconds * 1000
  }

  function quietAllows(kind, cfg) {
    if (!inQuietHours(cfg.quietHours, new Date(now()))) return true
    if (cfg.quietHours && cfg.quietHours.allowCritical === true && isCriticalKind(kind)) return true
    return false
  }

  function markSent(key) {
    boundedSet(lastSent, key, now())
  }

  function shouldDeliver(event, sessionId) {
    const cfg = config()
    if (cfg.enabled !== true) return false
    if (!eventEnabled(event.kind)) return false

    if (event.kind === 'turnBlocked') {
      const askedAt = lastQuestion.get(sessionId)
      if (askedAt !== undefined && now() - askedAt < DEDUPE_BLOCK_AFTER_QUESTION_MS) return false
    }
    if (event.kind === 'turnComplete') {
      const goalAt = lastGoal.get(sessionId)
      if (goalAt !== undefined && now() - goalAt < DEDUPE_TURN_AFTER_GOAL_MS) return false
    }
    if (event.kind === 'turnComplete' && Number(cfg.minDurationSec) > 0) {
      const minimum = Number(cfg.minDurationSec) * 1000
      if (!Number.isFinite(event.durationMs) || event.durationMs < minimum) return false
    }
    if (!quietAllows(event.kind, cfg)) return false
    if (!isCriticalKind(event.kind) && !cooldownAllows(`${sessionId || 'global'}:${event.kind}`, cfg)) {
      return false
    }
    return true
  }

  function emit(event, sessionId) {
    if (!shouldDeliver(event, sessionId)) return false
    markSent(`${sessionId || 'global'}:${event.kind}`)
    try {
      send(event)
    } catch (error) {
      logger(`[dsh-system-notify] send failed: ${error instanceof Error ? error.message : error}`)
    }
    return true
  }

  function handleSessionEvent(session, event) {
    try {
      if (!session || !event || typeof event.type !== 'string') return
      const cfg = config()
      if (cfg.enabled !== true) return
      const sessionId = sessionIdOf(session)
      if (!sessionId) return
      const meta = sessionMeta(session, sessionId)
      if (meta.isSubagent && cfg.ignoreSubagentSessions === true) return

      if (event.type === 'user/message') {
        if (!firstUserText.has(sessionId)) {
          const text = messageText(event.data && event.data.message ? event.data.message : event.data)
          if (text) boundedSet(firstUserText, sessionId, clampText(text, 160))
        }
        return
      }

      if (event.type === 'turn/start') {
        const turn = event.data && Number.isInteger(event.data.turn) ? event.data.turn : 0
        boundedSet(turns, sessionId, {
          turn,
          startedAt: typeof event.time === 'number' ? event.time : now(),
          lastText: '',
          toolError: ''
        })
        return
      }

      if (event.type === 'assistant/message') {
        const state = turns.get(sessionId)
        if (!state) return
        const text = messageText(event.data && event.data.message)
        if (text) state.lastText = clampText(text, 400)
        return
      }

      if (event.type === 'tool/result') {
        const state = turns.get(sessionId)
        if (!state) return
        const data = event.data || {}
        const isError = Boolean(data.error) || Boolean(data.message && data.message.isError)
        if (isError) {
          const text =
            messageText(data.message) ||
            (data.error && (data.error.reason || data.error.code)) ||
            ''
          if (text) state.toolError = clampText(text, 200)
        }
        return
      }

      if (event.type !== 'turn/end') return
      const state = turns.get(sessionId)
      turns.delete(sessionId)
      const reason = event.data && event.data.reason
      const reasonKind = reason && typeof reason === 'object' ? reason.kind : reason
      const kind = TURN_KINDS[reasonKind]
      if (!kind) return
      const startedAt = state ? state.startedAt : undefined
      const endedAt = typeof event.time === 'number' ? event.time : now()
      const durationMs = Number.isFinite(startedAt) ? Math.max(0, endedAt - startedAt) : 0
      const turn = event.data && Number.isInteger(event.data.turn) ? event.data.turn : state ? state.turn : undefined
      const failure = reason && reason.kind === 'error' ? reason.error : undefined

      const notification = {
        kind,
        sessionId,
        sessionTitle: meta.title,
        cwd: meta.cwd,
        turn,
        durationMs,
        summary:
          kind === 'turnComplete'
            ? state && state.lastText
            : kind === 'turnError'
              ? (failure && failure.message) || (state && state.toolError) || ''
              : '',
        error:
          kind === 'turnError'
            ? {
                message: (failure && failure.message) || (state && state.toolError) || '',
                code: failure && failure.code ? String(failure.code) : undefined
              }
            : undefined
      }
      emit(notification, sessionId)
    } catch (error) {
      logger(`[dsh-system-notify] session event failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function handleGoalChanged(payload) {
    try {
      const cfg = config()
      if (cfg.enabled !== true) return
      const change = payload && payload.change
      if (!change || !change.goal) return
      const operation = change.operation
      if (operation !== 'complete' && operation !== 'block') return
      const kind = operation === 'complete' ? 'goalComplete' : 'goalBlocked'
      const agent = payload.agent
      const session = resolveSession(agent, agent ? agent.id : undefined)
      const sessionId = sessionIdOf(session) || (agent ? agent.id : '') || 'goal'
      const meta = sessionMeta(session, sessionId)
      if (meta.isSubagent && cfg.ignoreSubagentSessions === true) return
      const goal = change.goal
      const notification = {
        kind,
        sessionId,
        sessionTitle: meta.title,
        cwd: meta.cwd,
        summary: goal.objective,
        goal: {
          objective: goal.objective,
          blockedReason: goal.blockedReason && goal.blockedReason.message ? goal.blockedReason.message : ''
        },
        error:
          operation === 'block' && goal.blockedReason
            ? { message: goal.blockedReason.message || '', code: goal.blockedReason.code || undefined }
            : undefined
      }
      if (!eventEnabled(kind)) return
      if (!quietAllows(kind, cfg)) return
      if (!isCriticalKind(kind) && !cooldownAllows(`${sessionId}:${kind}`, cfg)) return
      boundedSet(lastGoal, sessionId, now())
      markSent(`${sessionId}:${kind}`)
      send(notification)
    } catch (error) {
      logger(`[dsh-system-notify] goal event failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function handleNeedsInput(request) {
    try {
      const cfg = config()
      if (cfg.enabled !== true || !eventEnabled('needsInput')) return
      const questions = request && Array.isArray(request.questions) ? request.questions : []
      if (questions.length === 0) return
      const agent = request.agent
      const session = resolveSession(agent, agent ? agent.id : undefined)
      const sessionId = sessionIdOf(session) || (agent ? agent.id : '') || 'question'
      const meta = sessionMeta(session, sessionId)
      const first = questions[0] || {}
      const notification = {
        kind: 'needsInput',
        sessionId,
        sessionTitle: meta.title,
        cwd: meta.cwd,
        question: first.question,
        summary: first.question
      }
      if (!quietAllows('needsInput', cfg)) return
      if (!cooldownAllows(`${sessionId}:needsInput`, cfg)) return
      boundedSet(lastQuestion, sessionId, now())
      markSent(`${sessionId}:needsInput`)
      send(notification)
    } catch (error) {
      logger(`[dsh-system-notify] question event failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function handleApproval(request) {
    try {
      const cfg = config()
      if (cfg.enabled !== true || !eventEnabled('approvalRequest')) return
      const agent = request && request.agent
      const session = resolveSession(agent, agent ? agent.id : undefined)
      const sessionId = sessionIdOf(session) || (agent ? agent.id : '') || 'approval'
      const meta = sessionMeta(session, sessionId)
      const toolName = request && request.toolName ? request.toolName : ''
      const language = resolveLanguage(cfg.language)
      const display =
        request && request.displayReason && typeof request.displayReason === 'object'
          ? request.displayReason[language] || request.displayReason.en
          : ''
      const reason = display || (request && request.reason ? request.reason : '')
      const notification = {
        kind: 'approvalRequest',
        sessionId,
        sessionTitle: meta.title,
        cwd: meta.cwd,
        summary: reason,
        approval: { toolName, reason }
      }
      if (!quietAllows('approvalRequest', cfg)) return
      if (!cooldownAllows(`${sessionId}:approvalRequest`, cfg)) return
      markSent(`${sessionId}:approvalRequest`)
      send(notification)
    } catch (error) {
      logger(`[dsh-system-notify] approval event failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function handleSubagentEnd(info) {
    try {
      const cfg = config()
      if (cfg.enabled !== true || !eventEnabled('subagentComplete')) return
      if (!info) return
      const stopReason = typeof info.stopReason === 'string' ? info.stopReason : String(info.stopReason || '')
      const shortId = typeof info.id === 'string' ? info.id.slice(0, 8) : ''
      const provider = info.provider || 'subagent'
      const label = shortId ? `${provider} ${shortId}` : provider
      const notification = {
        kind: 'subagentComplete',
        sessionId: typeof info.id === 'string' ? info.id : 'subagent',
        subagent: {
          label,
          provider,
          stopReason
        },
        summary: info.lastAssistantMessage
          ? contentText(info.lastAssistantMessage)
          : `${label} ${stopReason}`,
        error: stopReason === 'error' ? { message: '', code: 'subagent-error' } : undefined
      }
      if (!quietAllows('subagentComplete', cfg)) return
      if (!cooldownAllows(`${notification.sessionId}:subagentComplete`, cfg)) return
      markSent(`${notification.sessionId}:subagentComplete`)
      send(notification)
    } catch (error) {
      logger(`[dsh-system-notify] subagent event failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function handleWorkflowEnd(info, result) {
    try {
      const cfg = config()
      if (cfg.enabled !== true || !eventEnabled('workflowComplete')) return
      if (!info) return
      const stopReason = result && result.stopReason ? String(result.stopReason) : 'completed'
      const name = info.meta && info.meta.name ? info.meta.name : 'workflow'
      const notification = {
        kind: 'workflowComplete',
        sessionId: typeof info.id === 'string' ? info.id : 'workflow',
        workflow: {
          name,
          stopReason,
          error: result && result.error ? String(result.error) : '',
          agentsStarted: result && Number.isInteger(result.agentsStarted) ? result.agentsStarted : 0
        },
        summary: result && result.error ? String(result.error) : name,
        error: stopReason === 'error' ? { message: summaryOf(result), code: 'workflow-error' } : undefined
      }
      if (!quietAllows('workflowComplete', cfg)) return
      if (!cooldownAllows(`${notification.sessionId}:workflowComplete`, cfg)) return
      markSent(`${notification.sessionId}:workflowComplete`)
      send(notification)
    } catch (error) {
      logger(`[dsh-system-notify] workflow event failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  function resetSession(sessionId) {
    if (typeof sessionId !== 'string') return
    turns.delete(sessionId)
    firstUserText.delete(sessionId)
    // lastSent/lastQuestion/lastGoal are intentionally kept tiny and bounded.
  }

  function dispose() {
    turns.clear()
    firstUserText.clear()
    lastSent.clear()
    lastQuestion.clear()
    lastGoal.clear()
  }

  return {
    handleSessionEvent,
    handleGoalChanged,
    handleNeedsInput,
    handleApproval,
    handleSubagentEnd,
    handleWorkflowEnd,
    resetSession,
    dispose
  }
}

function summaryOf(result) {
  return result && result.error ? String(result.error) : ''
}
