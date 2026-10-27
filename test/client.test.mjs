import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const clientPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client',
  'client.js'
)

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children }
    },
    useState(initial) {
      return [initial, () => {}]
    },
    useEffect() {},
    useMemo(factory) {
      return factory()
    }
  }
}

function loadClientModule() {
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
  const react = fakeReact()
  const moduleExports = definition.factory(() => react)
  return { moduleExports, react }
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
  const { moduleExports, react } = loadClientModule()
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

  const element = component()
  assert.equal(typeof element.type, 'function')
  const tree = element.type({})
  assert.ok(tree, 'App must return a render tree')
  assert.equal(tree.type, 'div')
})
