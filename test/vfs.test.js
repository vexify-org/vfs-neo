'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const VFS = require('../lib/index.js')

test('attach/detach backends', () => {
  const vfs = new VFS()
  const ram = new VFS.VRBackend()
  vfs.attach('mem', ram)
  assert.equal(vfs.mem, ram)
  vfs.detach('mem')
  assert.equal(vfs.mem, undefined)
})

test('detach unknown backend throws', () => {
  const vfs = new VFS()
  assert.throws(() => vfs.detach('nope'), /Unknown backend: nope/)
})

test('auto-routed read/write/delete/list', async () => {
  const vfs = new VFS()
  vfs.attach('mem', new VFS.VRBackend())
  await vfs.write('mem/a.txt', 'hi')
  assert.equal((await vfs.read('mem/a.txt')).toString(), 'hi')
  assert.deepEqual(await vfs.list('mem'), ['a.txt'])
  await vfs.delete('mem/a.txt')
  assert.deepEqual(await vfs.list('mem'), [])
})

test('invalid path and unknown backend errors', () => {
  const vfs = new VFS()
  vfs.attach('mem', new VFS.VRBackend())
  assert.throws(() => vfs.read('no-slash'), /Invalid path/)
  assert.throws(() => vfs.read('unknown/x'), /Unknown backend: unknown/)
})

test('copy across backends', async () => {
  const vfs = new VFS()
  const os = vfs.attach('local', new VFS.OSBackend({ root: '/tmp/vfs-test-copy' }))
  vfs.attach('mem', new VFS.VRBackend())
  await vfs.write('mem/source.txt', 'payload')
  await vfs.copy('mem/source.txt', 'local/dest.txt')
  assert.equal((await os.read('dest.txt')).toString(), 'payload')
})

test('constructors work without new', () => {
  assert.ok(new VFS() instanceof VFS)
  assert.ok(VFS.OSBackend({ root: '/tmp/vfs-test-new' }) instanceof VFS.OSBackend)
  assert.ok(VFS.VRBackend() instanceof VFS.VRBackend)
})
