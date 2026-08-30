'use strict'
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const OSBackend = require('../lib/backends/os.js')

let root
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-os-'))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

test('os write/read/delete', async () => {
  const b = new OSBackend({ root })
  await b.write('dir/a.txt', Buffer.from('hello'))
  assert.equal((await b.read('dir/a.txt')).toString(), 'hello')
  await b.delete('dir/a.txt')
  await assert.rejects(() => b.read('dir/a.txt'), /File not found/)
})

test('os list directory and prefix', async () => {
  const b = new OSBackend({ root })
  await b.write('a.txt', '1')
  await b.write('ab.txt', '2')
  await b.write('z.txt', '3')
  assert.deepEqual((await b.list()).sort(), ['a.txt', 'ab.txt', 'z.txt'])
  assert.deepEqual((await b.list('a')).sort(), ['a.txt', 'ab.txt'])
})

test('os blocks path traversal', () => {
  const b = new OSBackend({ root })
  // Sibling whose name shares the root's basename as a prefix — the naive
  // "startsWith(root)" check would wrongly allow this.
  const sibling = path.join(path.dirname(root), path.basename(root) + 'X', 'f.txt')
  const rel = path.relative(root, sibling)
  assert.throws(() => b.read(rel), /Path traversal detected/)
  assert.throws(() => b.read('../outside'), /Path traversal detected/)
  assert.throws(() => b.write('../outside.txt', 'x'), /Path traversal detected/)
})
