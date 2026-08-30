'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const VRBackend = require('../lib/backends/vr.js')

test('vr write/read/delete/list', async () => {
  const vr = new VRBackend()
  await vr.write('a', Buffer.from('x'))
  await vr.write('b/c', 'y')
  assert.equal((await vr.read('a')).toString(), 'x')
  assert.equal(await vr.read('b/c'), 'y')
  assert.deepEqual(await vr.list(), ['a', 'b/c'])
  assert.deepEqual(await vr.list('b'), ['b/c'])
  await vr.delete('a')
  assert.deepEqual(await vr.list(), ['b/c'])
})

test('vr missing file rejects', async () => {
  const vr = new VRBackend()
  await assert.rejects(() => vr.read('nope'), /File not found: nope/)
  await assert.rejects(() => vr.delete('nope'), /File not found: nope/)
})

test('vr stores deep copies', async () => {
  const vr = new VRBackend()
  const obj = { a: 1, nested: { b: 2 } }
  await vr.write('o', obj)
  obj.a = 99
  obj.nested.b = 99
  const got = await vr.read('o')
  assert.equal(got.a, 1)
  assert.equal(got.nested.b, 2)
})
