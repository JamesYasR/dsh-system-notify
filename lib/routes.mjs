/**
 * HTTP routes backing the settings page.
 *
 * The Host WebServer is same-origin with the Harness UI, so these routes are
 * only reachable from the loaded page (and any local process that already has
 * loopback access to the Harness server). We additionally reject a mismatched
 * Origin header and cap request bodies.
 */

import { normalizeConfig } from './config.mjs'

const MAX_BODY_BYTES = 256 * 1024

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(body))
}

function sameOrigin(req) {
  const origin = req.headers && req.headers.origin
  if (!origin) return true
  const host = req.headers && req.headers.host
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || !address) return false
  const normalized = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
  return normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.')
}

/**
 * Mutations require either a matching same-origin browser request or a
 * loopback caller (curl / the plugin's own diagnostics). A LAN client with no
 * Origin header cannot rewrite the configuration.
 */
function trustedMutation(req) {
  const origin = req.headers && req.headers.origin
  if (origin) return sameOrigin(req)
  return isLoopbackAddress(req.socket && req.socket.remoteAddress)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    let bytes = 0
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      data += chunk
    })
    req.on('end', () => {
      if (data === '') return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Mount the config/test routes.
 *
 * @param {object} options
 * @param {{register: Function}} options.webServer DSH WebServer service
 * @param {() => object} options.getSnapshot returns the settings-page payload
 * @param {(config: object) => object} options.saveConfig validates + persists a config
 * @param {(request: object) => Promise<object>} options.testNotification preview/test delivery
 * @returns {() => void} disposer
 */
export function mountRoutes(options) {
  const { webServer, getSnapshot, saveConfig, testNotification } = options
  const disposers = []

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-system-notify/config',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        try {
          sendJson(res, 200, { ok: true, ...getSnapshot() })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error.message || String(error) })
        }
        return
      }
      if (req.method === 'POST') {
        if (!trustedMutation(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
        try {
          const body = await readJsonBody(req)
          const candidate = body && body.config !== undefined ? body.config : body
          const normalized = normalizeConfig(candidate)
          const saved = saveConfig(normalized)
          sendJson(res, 200, { ok: true, config: saved, ...getSnapshot(saved) })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error.message || String(error) })
        }
        return
      }
      res.writeHead(405, { allow: 'GET, POST' })
      res.end()
    }
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-system-notify/test',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      if (!trustedMutation(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
      try {
        const body = await readJsonBody(req)
        const result = await testNotification(body || {})
        sendJson(res, 200, { ok: true, ...result })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message || String(error) })
      }
    }
  }))

  return () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* plugin unload */ }
    }
  }
}
