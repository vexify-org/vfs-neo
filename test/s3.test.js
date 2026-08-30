'use strict'
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const VFS = require('../lib/index.js')

let httpServer, endpoint, s3

before(async () => {
  // Spin up an in-process vs3-neo (S3-compatible) server as the backend target.
  const { S3Server } = await import('vs3-neo/src/server.js')
  const { S3Client } = await import('vs3-neo/src/client.js')
  const config = {
    server: { host: '127.0.0.1', port: 0, region: 'us-east-1' },
    storage: { backend: 'memory' },
    auth: { anonymous: false, users: [{ accessKey: 'minioadmin', secretKey: 'minioadmin' }] },
    versioning: { default: false },
    functions: { enabled: false },
    metrics: { enabled: false },
  }
  const server = new S3Server(config)
  await server.init()
  httpServer = server.listen(0, '127.0.0.1')
  await new Promise((r) => httpServer.once('listening', r))
  endpoint = 'http://127.0.0.1:' + httpServer.address().port

  const client = new S3Client({ endpoint, accessKey: 'minioadmin', secretKey: 'minioadmin' })
  const res = await client.createBucket('test-bucket')
  assert.equal(res.status, 200, 'createBucket should succeed')

  s3 = new VFS.S3Backend({
    bucket: 'test-bucket',
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    region: 'us-east-1',
    endpoint,
  })
})

after(() => {
  if (httpServer) httpServer.close()
})

test('s3 write/read roundtrip', async () => {
  await s3.write('a.txt', Buffer.from('hello s3'))
  assert.equal((await s3.read('a.txt')).toString(), 'hello s3')
})

test('s3 nested keys with special characters', async () => {
  await s3.write('weird key/name (1).txt', 'spécial')
  assert.equal((await s3.read('weird key/name (1).txt')).toString(), 'spécial')
})

test('s3 multipart upload >5MB', async () => {
  const big = Buffer.alloc(6 * 1024 * 1024, 0x61)
  await s3.write('big.bin', big)
  const got = await s3.read('big.bin')
  assert.equal(got.length, big.length)
})

test('s3 list with and without prefix', async () => {
  await s3.write('dir/a.txt', '1')
  await s3.write('dir/b.txt', '2')
  await s3.write('top.txt', '3')
  const prefixed = await s3.list('dir/')
  assert.ok(prefixed.includes('dir/a.txt'))
  assert.ok(prefixed.includes('dir/b.txt'))
  assert.ok(!prefixed.includes('top.txt'))
  const all = await s3.list()
  assert.ok(all.includes('top.txt'))
})

test('s3 delete removes object', async () => {
  await s3.write('del.txt', 'x')
  await s3.delete('del.txt')
  const list = await s3.list()
  assert.ok(!list.includes('del.txt'))
})

test('s3 read missing file throws File not found', async () => {
  await assert.rejects(() => s3.read('missing.txt'), /File not found: missing.txt/)
})
