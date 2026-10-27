import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { detectAudioFormat, saveSoundUpload } from '../lib/sound-upload.mjs'

function wavBuffer(size = 128) {
  const buffer = Buffer.alloc(size)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(size - 8, 4)
  buffer.write('WAVE', 8, 'ascii')
  return buffer
}

function oggBuffer(size = 128) {
  const buffer = Buffer.alloc(size)
  buffer.write('OggS', 0, 'ascii')
  return buffer
}

test('audio format detection requires the WAV/OGG magic bytes', () => {
  assert.equal(detectAudioFormat(wavBuffer()), 'wav')
  assert.equal(detectAudioFormat(oggBuffer()), 'ogg')
  assert.equal(detectAudioFormat(Buffer.from('not audio at all', 'utf8')), undefined)
  assert.equal(detectAudioFormat(Buffer.alloc(4)), undefined)
})

test('uploaded sounds are stored beside the config with the right extension', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-notify-sound-'))
  const configPath = path.join(directory, 'config.json')
  try {
    const wav = wavBuffer(256)
    const saved = saveSoundUpload({
      kind: 'normal',
      data: wav.toString('base64'),
      name: 'done.wav',
      configPath,
      platform: 'win32'
    })
    assert.equal(saved.ok, true)
    assert.equal(saved.format, 'wav')
    assert.ok(saved.path.startsWith(path.join(directory, 'sounds')))
    assert.ok(saved.path.endsWith('.wav'))
    assert.equal(fs.statSync(saved.path).size, wav.length)

    const oggSaved = saveSoundUpload({
      kind: 'error',
      data: oggBuffer().toString('base64'),
      name: 'error.ogg',
      configPath,
      platform: 'linux'
    })
    assert.equal(oggSaved.format, 'ogg')
    assert.ok(oggSaved.path.endsWith('.ogg'))
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('upload validation rejects oversized, empty and Windows OGG sounds', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-notify-sound-bad-'))
  const configPath = path.join(directory, 'config.json')
  try {
    assert.throws(() => saveSoundUpload({ kind: 'normal', data: '', configPath, platform: 'linux' }), /empty/)
    assert.throws(() => saveSoundUpload({
      kind: 'normal',
      data: Buffer.from('no').toString('base64'),
      configPath,
      platform: 'linux'
    }), /unsupported/)
    assert.throws(() => saveSoundUpload({
      kind: 'error',
      data: oggBuffer().toString('base64'),
      configPath,
      platform: 'win32'
    }), /WAV/)
    assert.throws(() => saveSoundUpload({
      kind: 'wrong',
      data: wavBuffer().toString('base64'),
      configPath,
      platform: 'linux'
    }), /kind/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
