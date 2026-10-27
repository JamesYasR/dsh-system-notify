/**
 * Per-user Windows protocol handler for interactive notifications.
 *
 * Toast action buttons use `activationType="protocol"` with URLs like
 * `dsh-system-notify://respond?...`. Clicking one starts
 * `lib/responder.ps1` through this HKCU registration; the script posts the
 * choice back to the plugin's loopback /dsh-system-notify/respond route.
 *
 * No administrator rights are required; only HKCU is touched.
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'

export const PROTOCOL_KEY = 'HKCU\\Software\\Classes\\dsh-system-notify'
export const PROTOCOL_SCHEME = 'dsh-system-notify'

function reg(args) {
  try {
    const result = spawnSync('reg.exe', args, {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10_000
    })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Install or refresh the protocol handler.
 * @param {object} options
 * @param {string} options.pkgDir plugin package directory
 * @param {string} options.powershellPath absolute powershell.exe path
 * @param {string} [options.iconPath] optional PNG used as the handler icon
 * @returns {boolean} true when the command registration was written
 */
export function ensureWindowsProtocol(options) {
  const { pkgDir, powershellPath, iconPath } = options
  if (!pkgDir || !powershellPath) return false
  const responder = path.join(pkgDir, 'lib', 'responder.ps1')
  const command = `"${powershellPath}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${responder}" "%1"`
  let ok = true
  ok = reg(['add', PROTOCOL_KEY, '/ve', '/d', 'URL:DSH System Notify Protocol', '/f']) && ok
  ok = reg(['add', PROTOCOL_KEY, '/v', 'URL Protocol', '/d', '', '/f']) && ok
  ok = reg(['add', PROTOCOL_KEY, '/v', 'FriendlyTypeName', '/d', 'DSH System Notify Action', '/f']) && ok
  if (iconPath) {
    ok = reg(['add', `${PROTOCOL_KEY}\\DefaultIcon`, '/ve', '/d', iconPath, '/f']) && ok
  }
  ok = reg(['add', `${PROTOCOL_KEY}\\shell\\open\\command`, '/ve', '/d', command, '/f']) && ok
  return ok
}

/** Remove the handler (plugin unload or interactive turned off). */
export function removeWindowsProtocol() {
  return reg(['delete', PROTOCOL_KEY, '/f'])
}
