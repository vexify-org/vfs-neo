# VFS-neo

Virtual File System — unified file storage interface supporting multiple backends.

## Install

```bash
npm install vfs-neo
```

Requires Node >= 18 (aligns with `node:fs/promises`).

## Quick Start

```js
const VFS = require('vfs-neo')

const vfs = new VFS()

// Attach backends
const os = vfs.attach('local', new VFS.OSBackend({ root: './data' }))
const ram = vfs.attach('mem', new VFS.VRBackend())

// Explicit backend calls
await vfs.local.write('hello.txt', Buffer.from('Hello world'))
const data = await vfs.local.read('hello.txt')

// Unified calls (auto-routed)
await vfs.write('mem/note.txt', 'RAM storage')
const list = await vfs.list('mem')

// Copy across backends
await vfs.copy('mem/note.txt', 'local/note.txt')
```

## Backends

### OSBackend

Local disk via `fs/promises`.

```js
new VFS.OSBackend({ root: './data' })
```

### VRBackend

In-memory Map (volatile, O(1)). Stores deep copies; modifying the original object after `write()` does not affect stored data.

```js
new VFS.VRBackend()
```

### S3Backend

AWS S3 compatible, with multipart upload for >5MB.

```js
new VFS.S3Backend({
  bucket: 'my-bucket',
  accessKey: '...',
  secretKey: '...',
  region: 'us-east-1',
  endpoint: 'https://custom.endpoint' // optional
})
```

The default endpoint is `https://<bucket>.s3.<region>.amazonaws.com` (virtual-host style). When a custom `endpoint` is provided the bucket is placed in the URL path (path-style, e.g. MinIO, LocalStack, vs3-neo).

Run against a local [vs3-neo](https://www.npmjs.com/package/vs3-neo) server (bundled as a dependency):

```js
const { S3Server } = require('vs3-neo/src/server.js')
const { S3Client } = require('vs3-neo/src/client.js')

const server = new S3Server({
  server: { host: '127.0.0.1', port: 9000, region: 'us-east-1' },
  storage: { backend: 'memory' },
  auth: { anonymous: false, users: [{ accessKey: 'minioadmin', secretKey: 'minioadmin' }] },
  versioning: { default: false },
  functions: { enabled: false },
  metrics: { enabled: false },
})
await server.init()
server.listen(9000, '127.0.0.1')

await new S3Client({
  endpoint: 'http://127.0.0.1:9000',
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
}).createBucket('my-bucket')

new VFS.S3Backend({
  bucket: 'my-bucket',
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
  region: 'us-east-1',
  endpoint: 'http://127.0.0.1:9000',
})
```

> Note: `vs3-neo/src/server.js` and `vs3-neo/src/client.js` are ESM modules; use `await import(...)` from CommonJS.

### JSQLBackend

jsql-neo database (BLOB storage).

```js
const jsql = require('jsql-neo')
const db = jsql.open('vfs.db')
new VFS.JSQLBackend({ jsql: db, tablePrefix: 'vfs_' })
```

## API

### `new VFS()`
Create a new VFS instance.

### `vfs.attach(name, backend)`
Register a backend and expose as `vfs[name]`.

### `vfs.detach(name)`
Remove a backend.

### `vfs.read(path)`
Auto-routed read: `'backend/path'`.

### `vfs.write(path, data)`
Auto-routed write. **Overwrites** existing files (same behavior as `node:fs/promises` `writeFile`).

### `vfs.delete(path)`
Auto-routed delete. Throws `File not found: ${path}` for missing files.

### `vfs.list(path)`
Auto-routed list; if just `'backend'`, lists root of that backend.

### `vfs.copy(src, dst)`
Read from `src`, write to `dst` (supports cross-backend).

## Error Handling

All errors are thrown:

- `Unknown backend: ${name}`
- `File not found: ${path}`
- `Invalid path: ${path} — expected "backend/path"`

## Testing

```bash
npm test
```

Runs the `node:test` suite covering the VFS routing layer and all backends (OS, VR, S3, JSQL). The S3 tests start an in-process vs3-neo server — the bundled S3-compatible dependency — and exercise the S3Backend against it, including multipart uploads (>5MB) and special-character keys.

## License

Apache 2.0 © vexify
