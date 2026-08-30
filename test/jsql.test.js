'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const JSQLBackend = require('../lib/backends/jsql.js')

// Minimal in-memory stand-in for the subset of the jsql-neo API that
// JSQLBackend uses (exec/get/all). Lets us test backend logic without
// pulling in the WASM database binary.
function fakeJsql() {
  const store = new Map()
  let tableExists = false
  return {
    exec(sql, params) {
      params = params || []
      if (/SELECT name FROM sqlite_master/.test(sql)) {
        return Promise.resolve(tableExists ? [{ name: 'vfs_files' }] : [])
      }
      if (/CREATE TABLE/.test(sql)) {
        tableExists = true
        return Promise.resolve()
      }
      if (/INSERT OR REPLACE/.test(sql)) {
        store.set(params[0], params[1])
        return Promise.resolve()
      }
      if (/DELETE FROM/.test(sql)) {
        const had = store.delete(params[0])
        return Promise.resolve({ changes: had ? 1 : 0 })
      }
      return Promise.resolve()
    },
    get(sql, params) {
      const row = store.get(params[0])
      return Promise.resolve(row === undefined ? undefined : { content: row })
    },
    all(sql, params) {
      const prefix = params && params[0] ? params[0].replace(/%$/, '') : ''
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort()
      return Promise.resolve(keys.map((path) => ({ path })))
    },
  }
}

test('jsql requires a jsql instance', () => {
  assert.throws(() => new JSQLBackend(), /requires: \{ jsql \}/)
  assert.throws(() => new JSQLBackend({}), /requires: \{ jsql \}/)
})

test('jsql write/read/delete/list', async () => {
  const b = new JSQLBackend({ jsql: fakeJsql() })
  await b.write('a.txt', 'one')
  await b.write('dir/b.txt', 'two')
  assert.equal(await b.read('a.txt'), 'one')
  assert.deepEqual((await b.list()).sort(), ['a.txt', 'dir/b.txt'])
  assert.deepEqual(await b.list('dir/'), ['dir/b.txt'])
  await b.delete('a.txt')
  await assert.rejects(() => b.read('a.txt'), /File not found/)
})

test('jsql delete missing file rejects', async () => {
  const b = new JSQLBackend({ jsql: fakeJsql() })
  await assert.rejects(() => b.delete('missing.txt'), /File not found/)
})
