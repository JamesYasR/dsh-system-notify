import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeConfig } from '../lib/config.mjs'
import { createEventCollector } from '../lib/events.mjs'

function makeConfig(overrides = {}) {
  return normalizeConfig({
    events: {
      turnComplete: true,
      turnError: true,
      turnBlocked: true,
      turnMaxTokens: true,
      needsInput: true,
      approvalRequest: true,
      goalComplete: true,
      goalBlocked: true,
      subagentComplete: true,
      workflowComplete: true
    },
    cooldownSec: 0,
    ...overrides
  })
}

function makeTitleService(title) {
  return { get: () => ({ title }) }
}

function makeCollector(config, sent, options = {}) {
  const clock = options.clock || { value: new Date(2026, 0, 1, 12, 0, 0).getTime() }
  const collector = createEventCollector({
    getConfig: () => config,
    send: (event) => sent.push(event),
    getSessionTitle: options.titleService || (() => undefined),
    getSessionById: options.getSessionById || (() => undefined),
    now: () => (typeof clock === 'function' ? clock() : clock.value),
    logger: () => {}
  })
  return { collector, clock }
}

const session = { id: 's1', header: { cwd: '/home/me/project' } }

test('turn completion carries title, summary, cwd, turn and duration', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig(), sent, { titleService: () => makeTitleService('My session') })
  collector.handleSessionEvent(session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  collector.handleSessionEvent(session, {
    type: 'assistant/message',
    time: 2_000,
    data: { message: { role: 'assistant', content: [{ type: 'text', text: '  All done.  ' }] } }
  })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 61_000,
    data: { turn: 1, reason: { kind: 'completed' } }
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].kind, 'turnComplete')
  assert.equal(sent[0].sessionId, 's1')
  assert.equal(sent[0].sessionTitle, 'My session')
  assert.equal(sent[0].cwd, '/home/me/project')
  assert.equal(sent[0].turn, 1)
  assert.equal(sent[0].durationMs, 60_000)
  assert.equal(sent[0].summary, 'All done.')
})

test('first user message is used as the title fallback', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig(), sent)
  collector.handleSessionEvent(session, {
    type: 'user/message',
    time: 100,
    data: { role: 'user', content: [{ type: 'text', text: 'Please add notifications' }] }
  })
  collector.handleSessionEvent(session, { type: 'turn/start', time: 200, data: { turn: 1 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 2_200,
    data: { turn: 1, reason: { kind: 'completed' } }
  })
  assert.equal(sent[0].sessionTitle, 'Please add notifications')
})

test('turn error preserves the failure message and code', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig(), sent)
  collector.handleSessionEvent(session, { type: 'turn/start', time: 1_000, data: { turn: 2 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 3_000,
    data: { turn: 2, reason: { kind: 'error', error: { message: 'upstream timeout', code: 'ETIMEDOUT' } } }
  })
  assert.equal(sent[0].kind, 'turnError')
  assert.equal(sent[0].error.message, 'upstream timeout')
  assert.equal(sent[0].error.code, 'ETIMEDOUT')
})

test('disabled events and subagent sessions are ignored', () => {
  const sent = []
  const config = makeConfig({ events: { turnComplete: false } })
  const { collector } = makeCollector(config, sent)
  collector.handleSessionEvent(session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 2_000,
    data: { turn: 1, reason: { kind: 'completed' } }
  })
  assert.equal(sent.length, 0)

  const subagentSent = []
  const subagentCollector = makeCollector(makeConfig(), subagentSent).collector
  const subagentSession = { id: 'child', header: { cwd: '/tmp', origin: 'subagent' } }
  subagentCollector.handleSessionEvent(subagentSession, {
    type: 'turn/start',
    time: 1_000,
    data: { turn: 1 }
  })
  subagentCollector.handleSessionEvent(subagentSession, {
    type: 'turn/end',
    time: 2_000,
    data: { turn: 1, reason: { kind: 'completed' } }
  })
  assert.equal(subagentSent.length, 0)
})

test('minimum duration only gates successful completions', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig({ minDurationSec: 120 }), sent)
  collector.handleSessionEvent(session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 61_000,
    data: { turn: 1, reason: { kind: 'completed' } }
  })
  assert.equal(sent.length, 0)

  collector.handleSessionEvent(session, { type: 'turn/start', time: 100_000, data: { turn: 2 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 230_000,
    data: { turn: 2, reason: { kind: 'completed' } }
  })
  assert.equal(sent.length, 1)

  collector.handleSessionEvent(session, { type: 'turn/start', time: 300_000, data: { turn: 3 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 301_000,
    data: { turn: 3, reason: { kind: 'error', error: { message: 'fast failure' } } }
  })
  assert.equal(sent.length, 2)
})

test('cooldown suppresses repeated non-critical notifications', () => {
  const sent = []
  const { collector, clock } = makeCollector(makeConfig({ cooldownSec: 10 }), sent)
  clock.value = 1_000
  const run = (time) => {
    clock.value = time
    collector.handleSessionEvent(session, { type: 'turn/start', time, data: { turn: 1 } })
    collector.handleSessionEvent(session, {
      type: 'turn/end',
      time: time + 100,
      data: { turn: 1, reason: { kind: 'completed' } }
    })
  }
  run(1_000)
  run(5_000)
  assert.equal(sent.length, 1)
  run(20_000)
  assert.equal(sent.length, 2)
})

test('quiet hours suppress normal events but keep critical errors', () => {
  const sent = []
  const night = new Date(2026, 0, 1, 23, 0, 0).getTime()
  const { collector } = makeCollector(
    makeConfig({ quietHours: { enabled: true, start: '22:00', end: '08:00', allowCritical: true } }),
    sent,
    { clock: () => night }
  )
  collector.handleSessionEvent(session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 2_000,
    data: { turn: 1, reason: { kind: 'completed' } }
  })
  assert.equal(sent.length, 0)

  collector.handleSessionEvent(session, { type: 'turn/start', time: 3_000, data: { turn: 2 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 4_000,
    data: { turn: 2, reason: { kind: 'error', error: { message: 'boom' } } }
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].kind, 'turnError')
})

test('approval requests resolve the session through the sessions service', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig(), sent, {
    titleService: () => makeTitleService('Recovered session'),
    getSessionById: (id) => (id === 's1' ? session : undefined)
  })
  collector.handleApproval({
    agent: { id: 's1' },
    toolName: 'bash',
    displayReason: { en: 'Delete the build directory', zh: '删除构建目录' }
  })
  assert.equal(sent[0].kind, 'approvalRequest')
  assert.equal(sent[0].sessionTitle, 'Recovered session')
  assert.equal(sent[0].approval.toolName, 'bash')
})

test('blocking prompts still notify during quiet hours when allowed', () => {
  const sent = []
  const night = new Date(2026, 0, 1, 23, 0, 0).getTime()
  const { collector } = makeCollector(
    makeConfig({ quietHours: { enabled: true, start: '22:00', end: '08:00', allowCritical: true } }),
    sent,
    { clock: () => night }
  )
  collector.handleNeedsInput({
    questions: [{ id: 'q1', question: 'Pick a colour' }],
    agent: { id: 's1', session }
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].kind, 'needsInput')
})

test('a pending question suppresses the duplicate blocked notification', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig(), sent)
  collector.handleNeedsInput({
    questions: [{ id: 'q1', question: 'Pick a colour' }],
    agent: { id: 's1', session }
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].kind, 'needsInput')
  assert.equal(sent[0].question, 'Pick a colour')

  collector.handleSessionEvent(session, { type: 'turn/start', time: 2_000, data: { turn: 1 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 3_000,
    data: { turn: 1, reason: { kind: 'blocked' } }
  })
  assert.equal(sent.length, 1)
})

test('approval requests and goal events are delivered', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig(), sent, {
    titleService: () => makeTitleService('Goal session')
  })
  collector.handleApproval({ agent: { id: 's1', session }, toolName: 'bash', reason: 'rm -rf build' })
  assert.equal(sent[0].kind, 'approvalRequest')
  assert.equal(sent[0].approval.toolName, 'bash')

  collector.handleGoalChanged({
    agent: { id: 's1', session },
    change: {
      operation: 'complete',
      ref: { id: 'g1', revision: 2 },
      goal: { id: 'g1', revision: 2, objective: 'Ship v1', phase: 'complete' }
    }
  })
  assert.equal(sent[1].kind, 'goalComplete')
  assert.equal(sent[1].summary, 'Ship v1')

  // The goal completion suppresses the turn-complete notification right after it.
  collector.handleSessionEvent(session, { type: 'turn/start', time: 5_000, data: { turn: 1 } })
  collector.handleSessionEvent(session, {
    type: 'turn/end',
    time: 6_000,
    data: { turn: 1, reason: { kind: 'completed' } }
  })
  assert.equal(sent.length, 2)
})

test('goal block and workflow/subagent completion events carry their facts', () => {
  const sent = []
  const { collector } = makeCollector(makeConfig(), sent)
  collector.handleGoalChanged({
    agent: { id: 's1', session },
    change: {
      operation: 'block',
      ref: { id: 'g1', revision: 3 },
      goal: {
        id: 'g1',
        revision: 3,
        objective: 'Ship v1',
        phase: 'blocked',
        blockedReason: { code: 'no-access', message: 'registry denied' }
      }
    }
  })
  assert.equal(sent[0].kind, 'goalBlocked')
  assert.equal(sent[0].error.message, 'registry denied')

  collector.handleWorkflowEnd({ id: 'w1', meta: { name: 'audit', description: '' } }, {
    stopReason: 'completed',
    agentsStarted: 3
  })
  assert.equal(sent[1].kind, 'workflowComplete')
  assert.equal(sent[1].workflow.agentsStarted, 3)

  collector.handleSubagentEnd({
    id: 'child-1',
    provider: 'spawn',
    stopReason: 'error',
    lastAssistantMessage: [{ type: 'text', text: 'child failed' }]
  })
  assert.equal(sent[2].kind, 'subagentComplete')
  assert.equal(sent[2].error.code, 'subagent-error')
})
