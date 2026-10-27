import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeConfig } from '../lib/config.mjs'
import { renderNotification, sampleEvent } from '../lib/format.mjs'

const base = normalizeConfig({})

function withConfig(overrides) {
  return normalizeConfig({ ...base, ...overrides, include: { ...base.include, ...(overrides.include || {}) } })
}

const event = {
  kind: 'turnComplete',
  sessionId: 'session-1234567890',
  sessionTitle: 'Refactor the settings page',
  cwd: '/home/me/projects/demo',
  turn: 3,
  durationMs: 72_000,
  summary: '  Done.   Settings page now saves and plays a test sound.  '
}

test('detailed style respects include.sessionTitle=false', () => {
  const rendered = renderNotification(
    event,
    withConfig({ style: 'detailed', language: 'en', include: { sessionTitle: false, sessionId: false } })
  )
  assert.equal(rendered.title, 'Task completed')
  assert.equal(rendered.lines.some((line) => line.includes('Refactor')), false)
  assert.ok(rendered.lines.includes('/home/me/projects/demo'))
})

test('privacy style carries no body content', () => {
  const rendered = renderNotification(event, withConfig({ style: 'privacy', language: 'en' }))
  assert.equal(rendered.title, 'Task completed')
  assert.deepEqual(rendered.lines, [])
})

test('simple style shows only the session title', () => {
  const rendered = renderNotification(event, withConfig({ style: 'simple', language: 'en' }))
  assert.equal(rendered.title, 'Task completed')
  assert.deepEqual(rendered.lines, ['Refactor the settings page'])
})

test('standard style shows title, summary, workspace and duration', () => {
  const rendered = renderNotification(event, withConfig({ style: 'standard', language: 'en' }))
  assert.deepEqual(rendered.lines, [
    'Refactor the settings page',
    'Done. Settings page now saves and plays a test sound.',
    'demo · took 1m 12s'
  ])
})

test('detailed style adds the full path, turn and session id', () => {
  const rendered = renderNotification(
    { ...event, durationMs: 120_000 },
    withConfig({ style: 'detailed', language: 'zh', include: { sessionId: true } })
  )
  assert.equal(rendered.title, '任务完成 · Refactor the settings page')
  assert.deepEqual(rendered.lines, [
    'Done. Settings page now saves and plays a test sound.',
    '/home/me/projects/demo',
    '会话 session- · 第 3 轮 · 耗时 2 分 00 秒'
  ])
})

test('detailed errors keep the message and error code', () => {
  const rendered = renderNotification(
    {
      kind: 'turnError',
      sessionTitle: 'Broken build',
      cwd: 'D:\\work\\app',
      turn: 2,
      durationMs: 5_000,
      error: { message: 'connection reset', code: 'ECONNRESET' }
    },
    withConfig({ style: 'detailed', language: 'en', include: { sessionId: true } })
  )
  assert.equal(rendered.urgency, 'critical')
  assert.equal(rendered.soundKind, 'error')
  assert.deepEqual(rendered.lines, [
    'connection reset',
    'D:\\work\\app',
    'turn 2 · took 5s · code ECONNRESET'
  ])
})

test('privacy hides error details but keeps the critical category', () => {
  const rendered = renderNotification(
    { kind: 'turnError', sessionTitle: 'secret project', cwd: '/secret', error: { message: 'boom' } },
    withConfig({ style: 'privacy', language: 'en' })
  )
  assert.equal(rendered.title, 'Task failed')
  assert.deepEqual(rendered.lines, [])
  assert.equal(rendered.urgency, 'critical')
})

test('questions are trimmed and clipped by summaryMaxChars', () => {
  const longQuestion = 'x'.repeat(500)
  const rendered = renderNotification(
    { kind: 'needsInput', sessionTitle: 'Question', question: longQuestion },
    withConfig({ style: 'standard', language: 'en', summaryMaxChars: 40 })
  )
  assert.equal(rendered.lines[0], 'Question')
  assert.equal(rendered.lines[1].length, 40)
  assert.ok(rendered.lines[1].endsWith('…'))
})

test('custom notifications use their own title but obey privacy', () => {
  const visible = renderNotification(
    { kind: 'custom', custom: { title: 'Deploy finished', body: 'All green.' } },
    withConfig({ style: 'simple', language: 'en' })
  )
  assert.equal(visible.title, 'Deploy finished')
  const privacy = renderNotification(
    { kind: 'custom', custom: { title: 'Deploy finished', body: 'All green.' } },
    withConfig({ style: 'privacy', language: 'en' })
  )
  assert.equal(privacy.title, 'Notification')
  assert.deepEqual(privacy.lines, [])
})

test('include flags can remove workspace, duration and summary', () => {
  const rendered = renderNotification(
    event,
    withConfig({
      style: 'standard',
      language: 'en',
      include: { workspace: false, duration: false, summary: false }
    })
  )
  assert.deepEqual(rendered.lines, ['Refactor the settings page'])
})

test('zh and en sample events render without empty required fields', () => {
  for (const language of ['zh', 'en']) {
    const rendered = renderNotification(sampleEvent(language), withConfig({ language }))
    assert.ok(rendered.title.length > 0)
    assert.ok(rendered.lines.length > 0)
    assert.equal(rendered.language, language)
  }
})
