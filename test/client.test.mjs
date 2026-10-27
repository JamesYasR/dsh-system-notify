import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

import { normalizeConfig } from '../lib/config.mjs'

const clientPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client',
  'client.js'
)

function fakeReact(initialState = []) {
  const queue = initialState.slice()
  return {
    createElement(type, props, ...children) {
      const normalized = { ...(props || {}) }
      if (typeof type === 'function') {
        return type({ ...normalized, children: children.length === 1 ? children[0] : children })
      }
      return { type, props: normalized, children }
    },
    useState(initial) {
      return [queue.length > 0 ? queue.shift() : initial, () => {}]
    },
    useEffect() {},
    useMemo(factory) {
      return factory()
    }
  }
}

function loadClientModule(react = fakeReact()) {
  const source = fs.readFileSync(clientPath, 'utf8')
  let definition
  const context = {
    window: {
      __ModuleLoader__: {
        load(value) {
          definition = value
        }
      }
    },
    navigator: { language: 'zh-CN' },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    console
  }
  vm.runInNewContext(source, context, { filename: 'client/client.js' })
  assert.ok(definition, 'client module must call window.__ModuleLoader__.load')
  assert.equal(definition.id, 'dsh-system-notify')
  const moduleExports = definition.factory(() => react)
  return { moduleExports, react }
}

function mountClient(moduleExports) {
  let component
  moduleExports.apply({
    slots: {
      inject(_slot, callback) {
        return callback()
      },
      register(_meta, value) {
        component = value
        return () => {}
      }
    }
  })
  return component
}

test('client module registers one settings.section page', () => {
  const { moduleExports } = loadClientModule()
  assert.equal(moduleExports.name, 'dsh-system-notify')
  assert.equal(Array.from(moduleExports.inject).join(','), 'slots')

  const registrations = []
  const ctx = {
    slots: {
      inject(slot, callback) {
        assert.equal(slot, 'settings.section')
        return callback()
      },
      register(meta, component) {
        registrations.push({ meta, component })
        return () => {}
      }
    }
  }
  moduleExports.apply(ctx)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].meta.name, 'settings.section')
  assert.equal(registrations[0].meta.id, 'dsh-system-notify')
  assert.equal(registrations[0].meta.label(), '系统通知')
})

test('client settings page renders its loading state without throwing', () => {
  const { moduleExports } = loadClientModule()
  const component = mountClient(moduleExports)
  const tree = component()
  assert.ok(tree, 'App must return a render tree')
  assert.equal(tree.type, 'div')
  assert.ok(JSON.stringify(tree).includes('加载中'))
})

test('client settings page renders the loaded configuration form', () => {
  const config = normalizeConfig({
    sound: {
      normal: 'custom',
      error: 'custom',
      customNormalPath: 'C:\\sounds\\done.wav',
      customErrorPath: 'C:\\sounds\\error.wav'
    },
    interactive: { enabled: true, timeoutSec: 25 }
  })
  const snapshot = {
    config,
    defaults: normalizeConfig({}),
    version: '1.0.0',
    platform: 'win32',
    configPath: 'C:\\Users\\me\\AppData\\Roaming\\dsh-system-notify\\config.json',
    loadError: undefined,
    capabilities: {
      platform: 'win32',
      toast: { available: true, backend: 'windows-toast' },
      sound: { available: true, backend: 'powershell-soundplayer' },
      click: { available: true, backend: 'dsh-protocol' },
      notes: ['click.requiresDshDesktop'],
      iconAvailable: true
    },
    styleSamples: {
      privacy: { title: '任务完成', lines: [] },
      simple: { title: '任务完成', lines: ['示例会话'] },
      standard: { title: '任务完成', lines: ['示例会话', '摘要'] },
      detailed: { title: '任务完成 · 示例会话', lines: ['摘要', 'C:\\workspace\\demo'] }
    },
    client: { registered: true }
  }
  const react = fakeReact([snapshot, config, '', false])
  const { moduleExports } = loadClientModule(react)
  const component = mountClient(moduleExports)
  const tree = component()
  assert.ok(tree, 'the loaded settings form must render without throwing')
  assert.equal(tree.type, 'div')
  const serialized = JSON.stringify(tree)
  assert.ok(serialized.includes('系统通知'))
  assert.ok(serialized.includes('普通事件自定义音频'))
  assert.ok(serialized.includes('C:\\\\sounds\\\\done.wav'))
})
