var crypto = require('crypto')

var EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function md5Hex(data) {
  return crypto.createHash('md5').update(data).digest('hex')
}

// RFC3986 percent-encoding (AWS SigV4 also encodes !'()*).
function enc(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase()
  })
}

function S3Backend(opts) {
  if (!(this instanceof S3Backend)) return new S3Backend(opts)
  if (!opts || !opts.bucket || !opts.accessKey || !opts.secretKey || !opts.region) {
    throw new Error('S3Backend requires: bucket, accessKey, secretKey, region')
  }
  this.bucket = opts.bucket
  this.region = opts.region
  this.accessKey = opts.accessKey
  this.secretKey = opts.secretKey
  this.endpoint = opts.endpoint || ('https://' + this.bucket + '.s3.' + this.region + '.amazonaws.com')
  // A custom endpoint (MinIO, vs3-neo, localstack, ...) is addressed in
  // path-style (bucket in the URL path); the default AWS endpoint is
  // virtual-hosted-style (bucket in the hostname).
  this._pathStyle = !!opts.endpoint
  this._partSize = 5 * 1024 * 1024
}

// Build the canonical (signed) URL path for a key. Slashes stay literal so
// nested keys map to real path segments.
S3Backend.prototype._path = function (key) {
  var encKey = String(key == null ? '' : key).split('/').map(enc).join('/')
  if (this._pathStyle) {
    return '/' + enc(this.bucket) + (encKey ? '/' + encKey : '')
  }
  return '/' + encKey
}

// Canonical query string: sorted encoded name=value pairs (SigV4 order).
S3Backend.prototype._canonicalQuery = function (query) {
  var q = query || {}
  return Object.keys(q).sort().map(function (k) {
    return enc(k) + '=' + enc(q[k] == null ? '' : q[k])
  }).join('&')
}

S3Backend.prototype._sign = function (method, path, query, headers, body) {
  var self = this
  var amzdate = new Date().toISOString().replace(/[:-]/g, '').slice(0, 8) + 'T000000Z'
  headers['x-amz-date'] = amzdate
  headers['host'] = this.endpoint.replace(/^https?:\/\//, '')
  var payload = body ? sha256Hex(body) : EMPTY_SHA256
  headers['x-amz-content-sha256'] = payload
  var canonicalQuery = this._canonicalQuery(query)
  // vs3-neo canonicalizes the URI by re-encoding each path segment of the raw
  // (already percent-encoded) path; mirror that so signatures match.
  var canonicalPath = path.split('/').map(function (s) { return s === '' ? '' : enc(s) }).join('/')
  var signedHeaders = Object.keys(headers).sort().map(function (h) { return h.toLowerCase() }).join(';')
  var canonicalHeaders = Object.keys(headers).sort().map(function (h) { return h.toLowerCase() + ':' + headers[h].trim() + '\n' }).join('')
  var canonicalRequest = method + '\n' + canonicalPath + '\n' + canonicalQuery + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + payload
  var credentialScope = amzdate.slice(0, 8) + '/' + this.region + '/s3/aws4_request'
  var stringToSign = 'AWS4-HMAC-SHA256\n' + amzdate + '\n' + credentialScope + '\n' + sha256Hex(canonicalRequest)
  var dateKey = crypto.createHmac('sha256', 'AWS4' + this.secretKey).update(amzdate.slice(0, 8)).digest()
  var regionKey = crypto.createHmac('sha256', dateKey).update(this.region).digest()
  var serviceKey = crypto.createHmac('sha256', regionKey).update('s3').digest()
  var signingKey = crypto.createHmac('sha256', serviceKey).update('aws4_request').digest()
  var signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  headers['Authorization'] = 'AWS4-HMAC-SHA256 Credential=' + this.accessKey + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature
  return headers
}

S3Backend.prototype._request = function (method, key, body, query) {
  var path = this._path(key)
  var headers = {}
  this._sign(method, path, query, headers, body)
  var qs = this._canonicalQuery(query)
  var url = this.endpoint + path + (qs ? '?' + qs : '')
  return fetch(url, { method: method, headers: headers, body: body }).then(function (res) {
    if (res.status === 404) throw new Error('File not found: ' + key)
    if (!res.ok) return res.text().then(function (t) { throw new Error('S3 error: ' + t) })
    return res
  })
}

S3Backend.prototype.read = function (p) {
  return this._request('GET', p).then(function (res) { return res.arrayBuffer() }).then(function (ab) { return Buffer.from(ab) })
}

S3Backend.prototype.write = function (p, data) {
  var self = this
  var buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (buf.length <= this._partSize) {
    return this._request('PUT', p, buf).then(function () {})
  }
  return this._multipartUpload(p, buf)
}

S3Backend.prototype._multipartUpload = function (key, buf) {
  var self = this
  var path = this._path(key)
  var headers = {}
  this._sign('POST', path, { uploads: '' }, headers)
  var url = this.endpoint + path + '?uploads='
  return fetch(url, { method: 'POST', headers: headers }).then(function (res) {
    return res.text().then(function (xml) {
      if (!res.ok) throw new Error('S3 multipart error: ' + xml)
      var m = xml.match(/<UploadId>([^<]+)<\/UploadId>/)
      if (!m) throw new Error('S3 multipart error: missing UploadId in response')
      return m[1]
    })
  }).then(function (uploadId) {
    var parts = []
    var numParts = Math.ceil(buf.length / self._partSize)
    for (var i = 0; i < numParts; i++) {
      var start = i * self._partSize
      var end = Math.min(start + self._partSize, buf.length)
      parts.push({ partNumber: i + 1, data: buf.slice(start, end) })
    }
    return Promise.all(parts.map(function (part) {
      var pheaders = {}
      self._sign('PUT', path, { partNumber: String(part.partNumber), uploadId: uploadId }, pheaders, part.data)
      var purl = self.endpoint + path + '?partNumber=' + part.partNumber + '&uploadId=' + encodeURIComponent(uploadId)
      return fetch(purl, { method: 'PUT', headers: pheaders, body: part.data }).then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error('S3 multipart part error: ' + t) })
        // AWS-style multipart parts use MD5 ETags; echo back what the server returned.
        var etag = res.headers.get('etag') || ('"' + md5Hex(part.data) + '"')
        return '<Part><PartNumber>' + part.partNumber + '</PartNumber><ETag>' + etag + '</ETag></Part>'
      })
    })).then(function (partsXml) {
      var completeXml = '<CompleteMultipartUpload>' + partsXml.join('') + '</CompleteMultipartUpload>'
      var cheaders = {}
      self._sign('POST', path, { uploadId: uploadId }, cheaders, completeXml)
      var curl = self.endpoint + path + '?uploadId=' + encodeURIComponent(uploadId)
      return fetch(curl, { method: 'POST', headers: cheaders, body: completeXml })
    })
  }).then(function (res) {
    if (!res.ok) return res.text().then(function (t) { throw new Error('S3 multipart error: ' + t) })
  })
}

S3Backend.prototype.delete = function (p) {
  return this._request('DELETE', p).then(function () {})
}

S3Backend.prototype.list = function (prefix) {
  var self = this
  var query = { 'list-type': '2' }
  if (prefix) query.prefix = prefix
  var path = this._path('')
  var headers = {}
  this._sign('GET', path, query, headers)
  var qs = this._canonicalQuery(query)
  var url = this.endpoint + path + '?' + qs
  return fetch(url, { method: 'GET', headers: headers }).then(function (res) { return res.text() }).then(function (xml) {
    var keys = []
    var regex = /<Key>([^<]+)<\/Key>/g
    var m
    while ((m = regex.exec(xml)) !== null) {
      keys.push(decodeURIComponent(m[1]))
    }
    return keys
  })
}

module.exports = S3Backend
