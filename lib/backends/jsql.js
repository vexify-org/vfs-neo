function JSQLBackend(opts) {
  if (!(this instanceof JSQLBackend)) return new JSQLBackend(opts)
  if (!opts || !opts.jsql) {
    throw new Error('JSQLBackend requires: { jsql }')
  }
  this.jsql = opts.jsql
  this.table = (opts.tablePrefix || 'vfs_') + 'files'
}

JSQLBackend.prototype._ensureTable = function () {
  var self = this
  return this.jsql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [this.table]).then(function (rows) {
    if (rows.length) return
    return self.jsql.exec(
      "CREATE TABLE " + self.table + " (path TEXT PRIMARY KEY, content BLOB, updated_at BIGINT)"
    )
  })
}

JSQLBackend.prototype.read = function (p) {
  var self = this
  return this._ensureTable().then(function () {
    return self.jsql.get("SELECT content FROM " + self.table + " WHERE path=?", [p])
  }).then(function (row) {
    if (!row) throw new Error('File not found: ' + p)
    return row.content
  })
}

JSQLBackend.prototype.write = function (p, data) {
  var self = this
  return this._ensureTable().then(function () {
    return self.jsql.exec(
      "INSERT OR REPLACE INTO " + self.table + " (path, content, updated_at) VALUES (?, ?, ?)",
      [p, data, Date.now()]
    )
  })
}

JSQLBackend.prototype.delete = function (p) {
  var self = this
  return this._ensureTable().then(function () {
    return self.jsql.exec("DELETE FROM " + self.table + " WHERE path=?", [p])
  }).then(function (res) {
    if (res && res.changes === 0) throw new Error('File not found: ' + p)
  })
}

JSQLBackend.prototype.list = function (prefix) {
  var self = this
  return this._ensureTable().then(function () {
    if (prefix) {
      return self.jsql.all("SELECT path FROM " + self.table + " WHERE path LIKE ?", [prefix + '%'])
    }
    return self.jsql.all("SELECT path FROM " + self.table)
  }).then(function (rows) {
    return rows.map(function (r) { return r.path })
  })
}

module.exports = JSQLBackend