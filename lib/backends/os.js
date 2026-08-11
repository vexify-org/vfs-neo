const fs = require('fs')
const path = require('path')

function OSBackend(opts) {
  if (!(this instanceof OSBackend)) return new OSBackend(opts)
  this.root = path.resolve(opts && opts.root ? opts.root : './data')
}

function _abs(self, p) {
  const full = path.join(self.root, p)
  if (full.indexOf(self.root) !== 0) {
    throw new Error('Path traversal detected: ' + p)
  }
  return full
}

OSBackend.prototype.read = function (p) {
  return fs.promises.readFile(_abs(this, p)).catch(function (err) {
    if (err.code === 'ENOENT') {
      throw new Error('File not found: ' + p)
    }
    throw err
  })
}

OSBackend.prototype.write = function (p, data) {
  const abspath = _abs(this, p)
  const dir = path.dirname(abspath)
  return fs.promises.mkdir(dir, { recursive: true }).then(function () {
    return fs.promises.writeFile(abspath, data)
  })
}

OSBackend.prototype.delete = function (p) {
  return fs.promises.unlink(_abs(this, p)).catch(function (err) {
    if (err.code === 'ENOENT') {
      throw new Error('File not found: ' + p)
    }
    throw err
  })
}

OSBackend.prototype.list = function (prefix) {
  const self = this
  const full = _abs(this, prefix || '.')
  return fs.promises.stat(full).then(function (stats) {
    if (stats.isDirectory()) {
      return fs.promises.readdir(full)
    }
    const dir = path.dirname(full)
    const filterStr = path.basename(full)
    return fs.promises.readdir(dir).then(function (entries) {
      return entries.filter(function (e) { return e.indexOf(filterStr) === 0 })
    })
  }).catch(function (err) {
    if (err.code === 'ENOENT') {
      const p = prefix || ''
      const filterStr = path.basename(p)
      const dir = p ? path.dirname(_abs(self, p)) : self.root
      return fs.promises.readdir(dir).then(function (entries) {
        return entries.filter(function (e) { return e.indexOf(filterStr) === 0 })
      })
    }
    throw err
  })
}

module.exports = OSBackend