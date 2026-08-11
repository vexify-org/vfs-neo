const OSBackend = require('./backends/os.js')
const VRBackend = require('./backends/vr.js')
const S3Backend = require('./backends/s3.js')
const JSQLBackend = require('./backends/jsql.js')

function VFS() {
  if (!(this instanceof VFS)) return new VFS()
  this._backends = {}
}

VFS.prototype.attach = function (name, backend) {
  this._backends[name] = backend
  this[name] = backend
  return backend
}

VFS.prototype.detach = function (name) {
  if (!this._backends[name]) {
    throw new Error('Unknown backend: ' + name)
  }
  delete this._backends[name]
  delete this[name]
}

function _route(self, path) {
  const idx = path.indexOf('/')
  if (idx === -1) {
    throw new Error('Invalid path: ' + path + ' — expected "backend/path"')
  }
  const name = path.slice(0, idx)
  const sub = path.slice(idx + 1)
  const backend = self._backends[name]
  if (!backend) {
    throw new Error('Unknown backend: ' + name)
  }
  return { backend, sub }
}

VFS.prototype.read = function (path) {
  const { backend, sub } = _route(this, path)
  return backend.read(sub)
}

VFS.prototype.write = function (path, data) {
  const { backend, sub } = _route(this, path)
  return backend.write(sub, data)
}

VFS.prototype.delete = function (path) {
  const { backend, sub } = _route(this, path)
  return backend.delete(sub)
}

VFS.prototype.list = function (path) {
  if (path.indexOf('/') === -1) {
    const backend = this._backends[path]
    if (!backend) {
      throw new Error('Unknown backend: ' + path)
    }
    return backend.list()
  }
  const { backend, sub } = _route(this, path)
  return backend.list(sub)
}

VFS.prototype.copy = function (src, dst) {
  return this.read(src).then(function (data) {
    return this.write(dst, data)
  }.bind(this))
}

VFS.OSBackend = OSBackend
VFS.VRBackend = VRBackend
VFS.S3Backend = S3Backend
VFS.JSQLBackend = JSQLBackend

module.exports = VFS