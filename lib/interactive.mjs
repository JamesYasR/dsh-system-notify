/**
 * Interactive notification prompts: approve/reject tool calls and answer
 * questions from the toast itself.
 *
 * Strategy: for a supported request we briefly own the `approval/request` or
 * `user-questions/request` waterfall. The notification carries action buttons;
 * a click resolves this interaction and its result is returned to DSH. If the
 * user does nothing for `interactive.timeoutSec`, clicks "Open DSH", or no
 * action backend exists, the handler delegates to `next()` so the normal Chat
 * UI prompt takes over.
 *
 * Windows buttons travel through a per-user `dsh-system-notify://` protocol
 * (lib/responder.ps1 -> POST /dsh-system-notify/respond). Linux buttons arrive
 * through freedesktop ActionInvoked; text/checklist dialogs use zenity.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { inQuietHours } from './config.mjs'
import { renderNotification } from './format.mjs'
import { resolveLanguage, translate } from './i18n.mjs'

const DELEGATE = Symbol('delegate')
export { DELEGATE }
const MAX_ACTIONS = 5

function clip(value, max) {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
  const characters = Array.from(text)
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join('')}…`
}

function normalizeOptions(question) {
  return Array.isArray(question && question.options) ? question.options : []
}

/** Approval actions shown on the notification. */
export function approvalActions(language) {
  return [
    { id: 'allow', label: translate(language, 'interaction.approve') },
    { id: 'deny', label: translate(language, 'interaction.reject') },
    { id: 'open', label: translate(language, 'action.openDsh') }
  ]
}

/**
 * Build question actions for the toast. Direct option buttons are preferred;
 * a "Choose…" dialog covers overflow or multi-select, "Other…" opens a text
 * input, and "Open DSH" delegates back to the Chat UI.
 */
export function questionActions(question, config, language) {
  const options = normalizeOptions(question)
  const maxOptions = Math.max(1, Math.min(3, Number(config.interactive.maxOptions) || 3))
  const specs = []
  if (options.length > 0) {
    if (question.multiSelect === true) {
      specs.push({ id: 'choose', label: translate(language, 'interaction.choose') })
    } else {
      let direct = Math.min(options.length, maxOptions)
      if (options.length > maxOptions) direct = Math.max(0, maxOptions - 1)
      for (let index = 0; index < direct; index += 1) {
        specs.push({ id: `option:${index}`, label: clip(options[index].label, 60) })
      }
      if (options.length > direct) {
        specs.push({ id: 'choose', label: translate(language, 'interaction.choose') })
      }
    }
  }
  specs.push({ id: 'input', label: translate(language, 'interaction.input') })
  specs.push({ id: 'open', label: translate(language, 'action.openDsh') })
  while (specs.length > MAX_ACTIONS) {
    const index = specs.findIndex((spec) => spec.id.startsWith('option:'))
    if (index < 0) break
    specs.splice(index, 1)
  }
  return specs.slice(0, MAX_ACTIONS)
}

/** Convert an approval action id to a DSH approval outcome. */
export function outcomeForApproval(action) {
  if (action === 'allow') return 'allowed-once'
  if (action === 'deny') return 'rejected'
  return DELEGATE
}

/**
 * Convert a question action + value into the DSH answer payload.
 * Returns DELEGATE when the action/timeout should fall back to the Chat UI.
 */
export function answerForQuestion(question, action, value) {
  const options = normalizeOptions(question)
  const id = question && question.id !== undefined && question.id !== null ? question.id : ''
  if (typeof action !== 'string' || !question) return DELEGATE
  if (action === 'open') return DELEGATE
  if (action.startsWith('option:')) {
    const index = Number(action.slice('option:'.length))
    if (!Number.isInteger(index) || index < 0 || index >= options.length) return DELEGATE
    return {
      answers: [{ id, selected: [String(options[index].label)] }]
    }
  }
  if (action === 'input') {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return DELEGATE
    return {
      answers: [{ id, selected: [], custom: clip(text, 2000) }]
    }
  }
  if (action === 'choose') {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
    const labels = values
      .map((item) => String(item))
      .filter((item) => options.some((option) => String(option.label) === item))
    if (labels.length === 0) return DELEGATE
    return {
      answers: [{
        id,
        selected: question.multiSelect === true ? labels : [labels[0]]
      }]
    }
  }
  return DELEGATE
}

/**
 * @param {object} options
 * @param {() => object} options.getConfig
 * @param {object} options.notifier createNotifier() result
 * @param {string} options.platform
 * @param {() => string|undefined} options.getOrigin
 * @param {(agent: object) => object} options.describeAgent
 * @param {(request: object) => void} [options.fallbackApproval]
 * @param {(request: object) => void} [options.fallbackQuestion]
 * @param {() => boolean} [options.isWindowsProtocolReady]
 * @param {(message: string) => void} [options.logger]
 * @param {(command: string, args: string[], options?: object) => any} [options.spawnImpl]
 */
export function createInteractiveManager(options = {}) {
  const getConfig = options.getConfig || (() => ({}))
  const notifier = options.notifier
  const platform = options.platform || process.platform
  const getOrigin = options.getOrigin || (() => undefined)
  const describeAgent = options.describeAgent || (() => ({}))
  const fallbackApproval = options.fallbackApproval || (() => {})
  const fallbackQuestion = options.fallbackQuestion || (() => {})
  const isWindowsProtocolReady = options.isWindowsProtocolReady || (() => false)
  const logger = typeof options.logger === 'function' ? options.logger : () => {}
  const spawnImpl = options.spawnImpl || spawn
  const pending = new Map()

  function config() {
    try {
      return getConfig() || {}
    } catch {
      return {}
    }
  }

  function origin() {
    try {
      const value = getOrigin()
      return typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/u, '') : undefined
    } catch {
      return undefined
    }
  }

  function canInteract() {
    const current = config()
    if (!current || current.enabled !== true) return false
    if (!current.interactive || current.interactive.enabled !== true) return false
    if (current.style === 'privacy') return false
    if (current.delivery === 'sound') return false
    if (!notifier || typeof notifier.sendInteractive !== 'function') return false
    if (platform === 'win32') {
      return Boolean(origin()) && Boolean(isWindowsProtocolReady())
    }
    if (platform === 'linux') {
      const commands = notifier.capabilities && notifier.capabilities.commands
      return Boolean(commands && commands.gdbus && commands.dbusMonitor)
    }
    return false
  }

  function languageFor(current) {
    return resolveLanguage(current.language)
  }

  function approvalReason(request, language) {
    const display = request && request.displayReason
    const localized =
      display && typeof display === 'object' ? display[language] || display.en : ''
    return localized || (request && request.reason) || ''
  }

  function approvalEvent(request) {
    const language = languageFor(config())
    const meta = describeAgent(request && request.agent)
    const reason = approvalReason(request, language)
    return {
      kind: 'approvalRequest',
      sessionId: meta.sessionId,
      sessionTitle: meta.sessionTitle,
      cwd: meta.cwd,
      summary: reason,
      approval: {
        toolName: request && request.toolName ? request.toolName : '',
        reason
      }
    }
  }

  function questionEvent(request, question) {
    const meta = describeAgent(request && request.agent)
    return {
      kind: 'needsInput',
      sessionId: meta.sessionId,
      sessionTitle: meta.sessionTitle,
      cwd: meta.cwd,
      question: question.question,
      summary: question.question
    }
  }

  function startInteraction(record) {
    return new Promise((resolve) => {
      const id = randomUUID()
      const token = randomBytes(24).toString('hex')
      const current = config()
      const timeoutSeconds = Math.max(5, Number(current.interactive && current.interactive.timeoutSec) || 20)
      const timeoutMs = timeoutSeconds * 1000
      let settled = false
      let handle
      let timer
      const signal = record.request && record.request.signal

      const cleanupSignal = () => {
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort)
        }
      }
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        cleanupSignal()
        pending.delete(id)
        if (handle) {
          void Promise.resolve(notifier.dismiss(handle)).catch(() => {})
        }
        resolve(value)
      }
      const onAbort = () => finish(DELEGATE)
      if (signal) {
        if (signal.aborted) return finish(DELEGATE)
        signal.addEventListener('abort', onAbort, { once: true })
      }
      const entry = {
        id,
        token,
        kind: record.kind,
        question: record.question,
        options: record.options,
        multiSelect: record.multiSelect,
        reason: record.reason,
        action: (action, value) => {
          if (settled) return
          try {
            if (record.kind === 'approval') {
              const outcome = outcomeForApproval(action)
              if (outcome === DELEGATE) finish(DELEGATE)
              else finish(outcome)
              return
            }
            if (action === 'dialog-open') {
              // A Windows responder is about to show an input/checklist dialog.
              // Keep the interaction alive while the user fills it in.
              extendTimer(180_000)
              return
            }
            if (action === 'input' || action === 'choose') {
              if (value !== undefined) {
                const answer = answerForQuestion(record.question, action, value)
                if (answer === DELEGATE) finish(DELEGATE)
                else finish(answer)
                return
              }
              extendTimer(180_000)
              void promptLinux(entry, action, Math.max(timeoutMs, 180_000)).then((dialogValue) => {
                if (dialogValue === undefined) {
                  finish(DELEGATE)
                  return
                }
                const answer = answerForQuestion(record.question, action, dialogValue)
                if (answer === DELEGATE) finish(DELEGATE)
                else finish(answer)
              })
              return
            }
            const answer = answerForQuestion(record.question, action, value)
            if (answer === DELEGATE) finish(DELEGATE)
            else finish(answer)
          } catch (error) {
            logger(`[dsh-system-notify] interaction action failed: ${error instanceof Error ? error.message : error}`)
            finish(DELEGATE)
          }
        },
        meta: () => ({
          kind: record.kind,
          question: record.question ? record.question.question : record.reason,
          options: normalizeOptions(record.question).map((option) => String(option.label)),
          multiSelect: record.multiSelect === true
        }),
        cancel: () => finish(DELEGATE)
      }
      pending.set(id, entry)
      const extendTimer = (milliseconds) => {
        if (settled) return
        clearTimeout(timer)
        timer = setTimeout(() => finish(DELEGATE), milliseconds)
        if (timer.unref) timer.unref()
      }
      timer = setTimeout(() => finish(DELEGATE), timeoutMs)
      if (timer.unref) timer.unref()

      const actions = record.actions
      notifier
        .sendInteractive(record.rendered, current, {
          interactionId: id,
          token,
          actions,
          baseUrl: origin(),
          onAction: (action) => entry.action(action)
        })
        .then((result) => {
          if (!result || result.ok !== true) {
            if (settled) return
            logger(`[dsh-system-notify] interactive notification unavailable: ${result && result.error}`)
            record.onSendFailure()
            finish(DELEGATE)
            return
          }
          if (settled) {
            if (result.handle) void Promise.resolve(notifier.dismiss(result.handle)).catch(() => {})
            return
          }
          handle = result.handle
        })
        .catch((error) => {
          if (settled) return
          logger(`[dsh-system-notify] interactive send failed: ${error instanceof Error ? error.message : error}`)
          record.onSendFailure()
          finish(DELEGATE)
        })
    })
  }

  function promptLinux(entry, action, timeoutMs) {
    return new Promise((resolve) => {
      const commands = (notifier.capabilities && notifier.capabilities.commands) || {}
      const zenity = commands.zenity
      if (!zenity) return resolve(undefined)
      const question = entry.question || {}
      const options = normalizeOptions(question)
      let args
      if (action === 'input') {
        args = ['--entry', '--title', 'DSH', '--text', String(question.question || '')]
      } else if (question.multiSelect === true) {
        args = ['--checklist', '--title', 'DSH', '--text', String(question.question || '')]
        args.push('--column', '', '--column', 'Option')
        for (const option of options) args.push('FALSE', String(option.label))
      } else {
        args = ['--list', '--title', 'DSH', '--text', String(question.question || '')]
        args.push('--column', '', '--column', 'Option')
        for (const option of options) args.push(String(option.label))
      }
      let child
      try {
        child = spawnImpl(zenity, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      } catch {
        return resolve(undefined)
      }
      let settled = false
      let output = ''
      const done = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { child.kill() } catch { /* already closed */ }
        resolve(value)
      }
      const timer = setTimeout(() => done(undefined), timeoutMs)
      if (timer.unref) timer.unref()
      if (child.stdout) child.stdout.on('data', (chunk) => { output += String(chunk) })
      child.once('error', () => done(undefined))
      child.once('close', (code) => {
        if (code !== 0) return done(undefined)
        const text = output.trim()
        if (!text) return done(undefined)
        if (action === 'input') return done(text)
        if (question.multiSelect === true) {
          const selected = text.split('|').map((part) => part.trim()).filter(Boolean)
          return done(selected)
        }
        return done(text.split('\n')[0].trim())
      })
    })
  }

  async function runApproval(request, next) {
    const current = config()
    const rendered = renderNotification(approvalEvent(request), current, { env: process.env })
    const language = rendered.language
    const actions = approvalActions(language)
    let fallbackSent = false
    const result = await startInteraction({
      kind: 'approval',
      request,
      rendered,
      actions,
      onSendFailure: () => {
        if (!fallbackSent) {
          fallbackSent = true
          fallbackApproval(request)
        }
      }
    })
    if (result === DELEGATE) return next()
    return result
  }

  async function runQuestion(request, question, next) {
    const current = config()
    const rendered = renderNotification(questionEvent(request, question), current, { env: process.env })
    const language = rendered.language
    const actions = questionActions(question, current, language)
    let fallbackSent = false
    const result = await startInteraction({
      kind: 'question',
      request,
      rendered,
      actions,
      question,
      options: normalizeOptions(question),
      multiSelect: question.multiSelect === true,
      onSendFailure: () => {
        if (!fallbackSent) {
          fallbackSent = true
          fallbackQuestion(request)
        }
      }
    })
    if (result === DELEGATE) return next()
    return result
  }

  function quietAllows(current) {
    if (!inQuietHours(current.quietHours, new Date())) return true
    return current.quietHours && current.quietHours.allowCritical === true
  }

  function handleApproval(request, next) {
    const current = config()
    if (!current.events || current.events.approvalRequest !== true) return undefined
    if (!canInteract() || !quietAllows(current) || !request || !request.agent) return undefined
    const meta = describeAgent(request.agent)
    if (meta.isSubagent && current.ignoreSubagentSessions !== false) return undefined
    return runApproval(request, next)
  }

  function handleQuestion(request, next) {
    const current = config()
    if (!current.events || current.events.needsInput !== true) return undefined
    if (!canInteract() || !quietAllows(current) || !request) return undefined
    const questions = Array.isArray(request.questions) ? request.questions : []
    if (questions.length !== 1) return undefined
    const question = questions[0]
    if (!question || typeof question.question !== 'string') return undefined
    if (request.agent) {
      const meta = describeAgent(request.agent)
      if (meta.isSubagent && current.ignoreSubagentSessions !== false) return undefined
    }
    return runQuestion(request, question, next)
  }

  function resolve(id, token, action, value) {
    if (typeof id !== 'string' || typeof token !== 'string') {
      return { ok: false, error: 'invalid-interaction' }
    }
    const entry = pending.get(id)
    if (!entry || entry.token !== token) return { ok: false, error: 'interaction-not-pending' }
    entry.action(action, value)
    return { ok: true }
  }

  function meta(id, token) {
    if (typeof id !== 'string' || typeof token !== 'string') return undefined
    const entry = pending.get(id)
    if (!entry || entry.token !== token) return undefined
    return entry.meta()
  }

  function dispose() {
    for (const entry of [...pending.values()]) entry.cancel()
    pending.clear()
  }

  return {
    canInteract,
    handleApproval,
    handleQuestion,
    resolve,
    meta,
    dispose,
    pendingCount: () => pending.size
  }
}
