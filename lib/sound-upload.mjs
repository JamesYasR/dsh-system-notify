/**
 * Custom notification sound uploads for the settings page.
 *
 * The browser reads a local file and posts base64 JSON; the Host validates the
 * container magic and stores it beside the config with user-only permissions.
 * Windows only accepts WAV (System.Media.SoundPlayer); Linux also accepts OGG
 * (paplay/pw-play can decode it).
 */

import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export const MAX_SOUND_BYTES = 5 * 1024 * 1024
const MAX_BASE64_CHARS = Math.ceil((MAX_SOUND_BYTES * 4) / 3) + 16

/** Detect a supported audio container from its magic bytes. */
export function detectAudioFormat(buffer) {
  if (!buffer || buffer.length < 12) return undefined
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'wav'
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'ogg'
  return undefined
}

/**
 * Validate and persist one uploaded sound.
 * @param {object} input
 * @param {'normal'|'error'} input.kind
 * @param {string} input.data base64 payload (no data: prefix)
 * @param {string} input.name original filename, used only for diagnostics/extension
 * @param {string} input.configPath active plugin config path
 * @param {string} input.platform process.platform
 * @returns {{ok:true,path:string,format:'wav'|'ogg'}}
 */
export function saveSoundUpload(input) {
  const kind = input && input.kind
  if (kind !== 'normal' && kind !== 'error') throw new Error('kind must be normal or error')
  const base64 = typeof input.data === 'string' ? input.data : ''
  if (!base64) throw new Error('empty audio payload')
  if (base64.length > MAX_BASE64_CHARS) throw new Error('audio file is too large (max 5 MiB)')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer || buffer.length === 0) throw new Error('invalid audio payload')
  if (buffer.length > MAX_SOUND_BYTES) throw new Error('audio file is too large (max 5 MiB)')
  const format = detectAudioFormat(buffer)
  if (!format) throw new Error('unsupported audio container (WAV or OGG only)')
  if (input.platform === 'win32' && format !== 'wav') {
    throw new Error('Windows notification sounds must be WAV')
  }

  const configPath = input.configPath
  if (typeof configPath !== 'string' || !configPath) throw new Error('config path unavailable')
  const directory = path.join(path.dirname(configPath), 'sounds')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const fileName = `${kind}-${Date.now()}-${randomBytes(4).toString('hex')}.${format}`
  const target = path.join(directory, fileName)
  fs.writeFileSync(target, buffer, { mode: 0o600 })
  return { ok: true, path: target, format }
}
