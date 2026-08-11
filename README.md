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
Auto-routed delete. Throws `File not found: ${path}` (except OSBackend which throws native `ENOENT` for missing files before 0.1.1; fixed in 0.1.1).

### `vfs.list(path)`
Auto-routed list; if just `'backend'`, lists root of that backend.

### `vfs.copy(src, dst)`
Read from `src`, write to `dst` (supports cross-backend).

## Error Handling

All errors are thrown:

- `Unknown backend: ${name}`
- `File not found: ${path}`
- `Invalid path: ${path} — expected "backend/path"`

## License

Apache 2.0 © vexify
