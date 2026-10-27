import assert from 'node:assert/strict'
import test from 'node:test'

import { isLoopbackAddress } from '../lib/routes.mjs'

test('loopback detection accepts local addresses only', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('127.8.9.10'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('192.168.1.20'), false)
  assert.equal(isLoopbackAddress('10.0.0.5'), false)
  assert.equal(isLoopbackAddress(undefined), false)
  assert.equal(isLoopbackAddress(''), false)
})
