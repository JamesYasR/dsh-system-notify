/**
 * Notification rendering: turn one internal event into localized title/body
 * lines, urgency and sound category according to the configured style.
 *
 * Pure module — no filesystem, child_process or Harness imports — so the
 * visual contract is unit-testable on every platform.
 */

import { formatDuration, resolveLanguage, translate } from './i18n.mjs'

const EVENT_LABEL_KEYS = {
  turnComplete: 'event.turnComplete',
  turnError: 'event.turnError',
  turnBlocked: 'event.turnBlocked',
  turnMaxTokens: 'event.turnMaxTokens',
  turnAborted: 'event.turnAborted',
  needsInput: 'event.needsInput',
  approvalRequest: 'event.approvalRequest',
  goalComplete: 'event.goalComplete',
  goalBlocked: 'event.goalBlocked',
  subagentComplete: 'event.subagentComplete',
  workflowComplete: 'event.workflowComplete',
  custom: 'event.custom',
  test: 'event.test'
}

const CRITICAL_KINDS = new Set(['turnError', 'goalBlocked'])
const ERROR_KINDS = new Set(['turnError', 'goalBlocked'])

export const MAX_BODY_LINES = 4

function collapse(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/gu, ' ').trim()
}

function clip(value, max) {
  const characters = Array.from(value)
  if (characters.length <= max) return value
  return `${characters.slice(0, Math.max(1, max - 1)).join('')}…`
}

function shortId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return ''
  return sessionId.length <= 8 ? sessionId : sessionId.slice(0, 8)
}

function baseName(target) {
  if (typeof target !== 'string' || target.length === 0) return ''
  const trimmed = target.replace(/[\\/]+$/u, '')
  const parts = trimmed.split(/[\\/]/u).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : trimmed
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return ''
}

function primaryText(input, language) {
  switch (input.kind) {
    case 'turnError': {
      const message = firstNonEmpty([input.error?.message, input.summary])
      return message || translate(language, 'error.unknown')
    }
    case 'needsInput':
      return firstNonEmpty([input.question, input.summary])
    case 'approvalRequest':
      return firstNonEmpty([input.approval?.reason, input.summary, input.approval?.toolName])
    case 'goalComplete':
      return firstNonEmpty([input.goal?.objective, input.summary])
    case 'goalBlocked': {
      const objective = firstNonEmpty([input.goal?.objective, input.summary])
      const reason = firstNonEmpty([input.goal?.blockedReason, input.error?.message])
      if (objective && reason) return `${objective} · ${reason}`
      return objective
    }
    case 'workflowComplete':
      return firstNonEmpty([input.workflow?.error, input.summary])
    case 'subagentComplete':
      return firstNonEmpty([input.subagent?.label, input.summary])
    case 'custom':
      return firstNonEmpty([input.custom?.body, input.summary])
    default:
      return firstNonEmpty([input.summary])
  }
}

function detailParts(input, config, language) {
  const parts = []
  if (config.include.sessionId) {
    const id = shortId(input.sessionId)
    if (id) parts.push(translate(language, 'meta.session', { id }))
  }
  if (Number.isInteger(input.turn) && input.turn > 0) {
    parts.push(translate(language, 'meta.turn', { turn: input.turn }))
  }
  if (config.include.duration && Number.isFinite(input.durationMs) && input.durationMs >= 0) {
    parts.push(translate(language, 'meta.duration', {
      duration: formatDuration(input.durationMs, language)
    }))
  }
  if (input.kind === 'workflowComplete' && input.workflow?.name) {
    parts.push(translate(language, 'meta.workflow', { name: clip(collapse(input.workflow.name), 40) }))
  }
  if (input.kind === 'subagentComplete' && input.subagent?.provider) {
    parts.push(translate(language, 'meta.subagent', {
      name: clip(collapse(input.subagent.provider), 40)
    }))
  }
  if (input.error?.code && input.error.code !== 'unknown') {
    parts.push(translate(language, 'meta.errorCode', { code: clip(collapse(input.error.code), 40) }))
  }
  return parts.filter(Boolean).join(' · ')
}

function pushUnique(lines, value) {
  const text = collapse(value)
  if (!text) return
  if (lines.includes(text)) return
  if (lines.length >= MAX_BODY_LINES - 1) return
  lines.push(text)
}

/**
 * Render one notification.
 *
 * @param {object} input event facts (see README "Event payloads")
 * @param {object} config normalised config
 * @param {object} [options] `{ env, localeHint, now, appNameFallback }`
 * @returns {{kind:string,title:string,lines:string[],urgency:'low'|'normal'|'critical',soundKind:'normal'|'error',language:'zh'|'en'}}
 */
export function renderNotification(input, config, options = {}) {
  const language = resolveLanguage(config.language, options.env, options.localeHint)
  const kind = typeof input.kind === 'string' && input.kind in EVENT_LABEL_KEYS ? input.kind : 'custom'
  const style = config.style
  const eventTitle = translate(language, EVENT_LABEL_KEYS[kind])
  const summaryLimit = config.summaryMaxChars

  const sessionTitle = clip(collapse(input.sessionTitle), 80)
  const cwd = typeof input.cwd === 'string' ? collapse(input.cwd) : ''
  const workspaceName = clip(baseName(cwd), 60)
  const durationText =
    config.include.duration && Number.isFinite(input.durationMs) && input.durationMs >= 0
      ? formatDuration(input.durationMs, language)
      : ''
  const primary = clip(collapse(primaryText(input, language)), summaryLimit)
  const showSession = config.include.sessionTitle && style !== 'privacy' && sessionTitle.length > 0
  const showPrimary = config.include.summary && style !== 'privacy' && primary.length > 0
  const showWorkspace = config.include.workspace && style !== 'privacy' && workspaceName.length > 0

  let title = eventTitle
  if (style !== 'privacy' && kind === 'custom' && input.custom && typeof input.custom.title === 'string') {
    const customTitle = collapse(input.custom.title)
    if (customTitle) title = clip(customTitle, 120)
  }
  const lines = []

  if (style === 'privacy') {
    // A privacy notification deliberately carries no content: no session,
    // workspace, summary, error message or path. Only the event category.
  } else if (style === 'simple') {
    pushUnique(lines, showSession ? sessionTitle : showWorkspace ? workspaceName : '')
  } else if (style === 'standard') {
    pushUnique(lines, showSession ? sessionTitle : '')
    pushUnique(lines, showPrimary ? primary : '')
    const meta = []
    if (showWorkspace) meta.push(workspaceName)
    if (durationText) meta.push(translate(language, 'meta.duration', { duration: durationText }))
    if (config.include.sessionId && input.sessionId) {
      meta.push(translate(language, 'meta.session', { id: shortId(input.sessionId) }))
    }
    pushUnique(lines, meta.join(' · '))
  } else {
    // detailed
    if (sessionTitle) title = clip(`${eventTitle} · ${sessionTitle}`, 90)
    pushUnique(lines, showPrimary ? primary : '')
    if (showWorkspace) {
      pushUnique(lines, cwd)
    }
    const details = detailParts(input, config, language)
    pushUnique(lines, details)
  }

  return {
    kind,
    title,
    lines: lines.slice(0, MAX_BODY_LINES - 1),
    urgency: CRITICAL_KINDS.has(kind) ? 'critical' : kind === 'needsInput' || kind === 'approvalRequest' ? 'normal' : 'normal',
    soundKind: ERROR_KINDS.has(kind) ? 'error' : 'normal',
    language
  }
}

/** Build a representative test event so the settings page can preview a style. */
export function sampleEvent(language) {
  const zh = language === 'zh'
  return {
    kind: 'turnComplete',
    sessionTitle: zh ? '示例会话：重构设置页' : 'Demo session: settings refactor',
    cwd: zh ? 'C:\\workspace\\demo-project' : '/home/user/demo-project',
    turn: 3,
    durationMs: 72_000,
    summary: zh
      ? '已经完成设置页的改造，并验证了保存、测试通知与音效播放。'
      : 'Settings page updated, with save, test notification and sound playback verified.'
  }
}

/** True for events that quiet hours may not suppress when allowCritical is on. */
export function isCriticalKind(kind) {
  return CRITICAL_KINDS.has(kind)
}
