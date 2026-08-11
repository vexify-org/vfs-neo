function VRBackend() {
  if (!(this instanceof VRBackend)) return new VRBackend()
  this._store = new Map()
}

function _clone(data) {
  if (Buffer.isBuffer(data)) return Buffer.from(data)
  try { return JSON.parse(JSON.stringify(data)) } catch (e) { return data }
}

VRBackend.prototype.read = function (p) {
  if (!this._store.has(p)) {
    return Promise.reject(new Error('File not found: ' + p))
  }
  return Promise.resolve(_clone(this._store.get(p)))
}

VRBackend.prototype.write = function (p, data) {
  this._store.set(p, _clone(data))
  return Promise.resolve()
}

VRBackend.prototype.delete = function (p) {
  if (!this._store.has(p)) {
    return Promise.reject(new Error('File not found: ' + p))
  }
  this._store.delete(p)
  return Promise.resolve()
}

VRBackend.prototype.list = function (prefix) {
  var keys = []
  this._store.forEach(function (_, k) {
    if (!prefix || k.indexOf(prefix) === 0) {
      keys.push(k)
    }
  })
  return Promise.resolve(keys.sort())
}

module.exports = VRBackend