import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeConfig } from '../lib/config.mjs'
import {
  DELEGATE,
  answerForQuestion,
  approvalActions,
  createInteractiveManager,
  outcomeForApproval,
  questionActions
} from '../lib/interactive.mjs'

function makeConfig(overrides = {}) {
  return normalizeConfig({
    interactive: { enabled: true, timeoutSec: 20, maxOptions: 3 },
    ...overrides
  })
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function makeManager(options = {}) {
  const state = {
    config: options.config || makeConfig(),
    captured: null,
    fallbackApprovals: 0,
    fallbackQuestions: 0,
    dismissals: 0
  }
  const notifier = {
    capabilities: {
      commands: { gdbus: '/usr/bin/gdbus', dbusMonitor: '/usr/bin/dbus-monitor' }
    },
    async sendInteractive(rendered, config, spec) {
      state.captured = spec
      state.rendered = rendered
      return { ok: true, handle: { platform: 'linux', notificationId: 7 } }
    },
    async dismiss() {
      state.dismissals += 1
      return { ok: true }
    }
  }
  const manager = createInteractiveManager({
    getConfig: () => state.config,
    notifier,
    platform: 'linux',
    getOrigin: () => 'http://127.0.0.1:51625',
    describeAgent: () => ({ sessionId: 's1', sessionTitle: 'Test session', cwd: '/project', isSubagent: false }),
    fallbackApproval: () => { state.fallbackApprovals += 1 },
    fallbackQuestion: () => { state.fallbackQuestions += 1 },
    logger: () => {}
  })
  return { manager, state }
}

test('approval actions map to DSH outcomes', () => {
  assert.equal(outcomeForApproval('allow'), 'allowed-once')
  assert.equal(outcomeForApproval('deny'), 'rejected')
  assert.equal(outcomeForApproval('open'), DELEGATE)
  assert.equal(outcomeForApproval('nope'), DELEGATE)
  const actions = approvalActions('en')
  assert.deepEqual(actions.map((action) => action.id), ['allow', 'deny', 'open'])
})

test('question actions prefer direct options and cover overflow, multi-select and text', () => {
  const two = questionActions(
    { options: [{ label: 'Yes' }, { label: 'No' }], multiSelect: false },
    makeConfig(),
    'en'
  )
  assert.deepEqual(two.map((action) => action.id), ['option:0', 'option:1', 'input', 'open'])

  const five = questionActions(
    { options: [1, 2, 3, 4, 5].map((n) => ({ label: `Option ${n}` })), multiSelect: false },
    makeConfig(),
    'en'
  )
  assert.equal(five.length, 5)
  assert.deepEqual(five.map((action) => action.id), ['option:0', 'option:1', 'choose', 'input', 'open'])

  const multi = questionActions(
    { options: [{ label: 'A' }, { label: 'B' }], multiSelect: true },
    makeConfig(),
    'en'
  )
  assert.deepEqual(multi.map((action) => action.id), ['choose', 'input', 'open'])
})

test('answers accept options, custom text and checklist selections', () => {
  const single = { id: 'q1', question: 'Pick', options: [{ label: 'A' }, { label: 'B' }], multiSelect: false }
  assert.deepEqual(answerForQuestion(single, 'option:1'), {
    answers: [{ id: 'q1', selected: ['B'] }]
  })
  assert.deepEqual(answerForQuestion(single, 'input', '  custom  '), {
    answers: [{ id: 'q1', selected: [], custom: 'custom' }]
  })
  assert.deepEqual(answerForQuestion(single, 'input', '   '), DELEGATE)
  assert.deepEqual(answerForQuestion({ ...single, multiSelect: true }, 'choose', ['A', 'B']), {
    answers: [{ id: 'q1', selected: ['A', 'B'] }]
  })
  assert.deepEqual(answerForQuestion(single, 'choose', ['B', 'not-an-option']), {
    answers: [{ id: 'q1', selected: ['B'] }]
  })
  assert.deepEqual(answerForQuestion(single, 'choose', ['not-an-option']), DELEGATE)
  assert.deepEqual(answerForQuestion(single, 'open'), DELEGATE)
})

test('approval resolves to allowed-once from the notification button', async () => {
  const { manager, state } = makeManager()
  const request = {
    agent: { id: 's1' },
    toolName: 'bash',
    reason: 'rm -rf build',
    signal: new AbortController().signal
  }
  const next = async () => 'unavailable'
  const promise = manager.handleApproval(request, next)
  assert.ok(promise)
  await tick()
  assert.ok(state.captured, 'notification actions must be sent')
  assert.deepEqual(state.captured.actions.map((action) => action.id), ['allow', 'deny', 'open'])
  assert.equal(manager.resolve(state.captured.interactionId, state.captured.token, 'allow').ok, true)
  assert.equal(await promise, 'allowed-once')
  assert.equal(state.dismissals, 1)
})

test('approval button rejects, and open action delegates to the Chat UI', async () => {
  const { manager, state } = makeManager()
  const request = {
    agent: { id: 's1' },
    toolName: 'bash',
    signal: new AbortController().signal
  }
  const next = async () => 'unavailable'

  const rejectPromise = manager.handleApproval(request, next)
  await tick()
  manager.resolve(state.captured.interactionId, state.captured.token, 'deny')
  assert.equal(await rejectPromise, 'rejected')

  const openPromise = manager.handleApproval(request, next)
  await tick()
  manager.resolve(state.captured.interactionId, state.captured.token, 'open')
  assert.equal(await openPromise, 'unavailable')
})

test('abort and send failure delegate and fall back to normal notifications', async () => {
  const { manager, state } = makeManager()
  const controller = new AbortController()
  const request = { agent: { id: 's1' }, toolName: 'bash', signal: controller.signal }
  const promise = manager.handleApproval(request, async () => 'unavailable')
  await tick()
  controller.abort()
  assert.equal(await promise, 'unavailable')

  const failing = makeManager()
  failing.manager = createInteractiveManager({
    getConfig: () => failing.state.config,
    notifier: {
      capabilities: { commands: { gdbus: 'x', dbusMonitor: 'y' } },
      async sendInteractive() {
        return { ok: false, error: 'no-backend' }
      },
      async dismiss() {
        return { ok: true }
      }
    },
    platform: 'linux',
    getOrigin: () => 'http://127.0.0.1:1',
    describeAgent: () => ({ sessionId: 's1', isSubagent: false }),
    fallbackApproval: () => { failing.state.fallbackApprovals += 1 },
    fallbackQuestion: () => {},
    logger: () => {}
  })
  const failingRequest = {
    agent: { id: 's1' },
    toolName: 'bash',
    signal: new AbortController().signal
  }
  assert.equal(await failing.manager.handleApproval(failingRequest, async () => 'unavailable'), 'unavailable')
  assert.equal(failing.state.fallbackApprovals, 1)
})

test('question option and checklist answers resolve from notification actions', async () => {
  const { manager, state } = makeManager()
  const question = {
    id: 'q1',
    question: 'Which environment?',
    options: [{ label: 'Staging' }, { label: 'Production' }],
    multiSelect: false
  }
  const request = { agent: { id: 's1' }, questions: [question], signal: new AbortController().signal }
  const next = async () => ({ answers: [{ id: 'q1', selected: ['chat-ui'] }] })

  const optionPromise = manager.handleQuestion(request, next)
  await tick()
  assert.ok(state.captured.actions.some((action) => action.id === 'option:1'))
  manager.resolve(state.captured.interactionId, state.captured.token, 'option:1')
  assert.deepEqual(await optionPromise, { answers: [{ id: 'q1', selected: ['Production'] }] })

  const multi = { ...question, multiSelect: true }
  const choosePromise = manager.handleQuestion({ ...request, questions: [multi] }, next)
  await tick()
  manager.resolve(state.captured.interactionId, state.captured.token, 'choose', ['Staging', 'Production'])
  assert.deepEqual(await choosePromise, {
    answers: [{ id: 'q1', selected: ['Staging', 'Production'] }]
  })
})

test('question text input resolves a custom answer', async () => {
  const { manager, state } = makeManager()
  const question = { id: 'q1', question: 'What should I name it?', options: [], multiSelect: false }
  const request = { agent: { id: 's1' }, questions: [question], signal: new AbortController().signal }
  const promise = manager.handleQuestion(request, async () => ({ answers: [] }))
  await tick()
  manager.resolve(state.captured.interactionId, state.captured.token, 'input', '  dsh-notify  ')
  assert.deepEqual(await promise, {
    answers: [{ id: 'q1', selected: [], custom: 'dsh-notify' }]
  })
})

test('multiple questions and disabled events stay on the normal Chat UI path', () => {
  const { manager } = makeManager()
  const request = {
    agent: { id: 's1' },
    questions: [
      { id: 'q1', question: 'One', options: [] },
      { id: 'q2', question: 'Two', options: [] }
    ]
  }
  assert.equal(manager.handleQuestion(request, async () => ({})), undefined)

  const disabled = makeManager({ config: makeConfig({ events: { needsInput: false } }) })
  assert.equal(disabled.manager.handleQuestion(request, async () => ({})), undefined)
})
