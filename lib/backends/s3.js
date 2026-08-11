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
  this._partSize = 5 * 1024 * 1024
}

S3Backend.prototype._sign = function (method, path, headers, body) {
  var self = this
  var amzdate = new Date().toISOString().replace(/[:-]/g, '').slice(0, 8) + 'T000000Z'
  headers['x-amz-date'] = amzdate
  headers['host'] = this.endpoint.replace(/^https?:\/\//, '')
  if (body) headers['content-length'] = Buffer.byteLength(body).toString()
  var signedHeaders = Object.keys(headers).sort().map(function (h) { return h.toLowerCase() }).join(';')
  var canonicalHeaders = Object.keys(headers).sort().map(function (h) { return h.toLowerCase() + ':' + headers[h].trim() + '\n' }).join('')
  var payload = body ? require('crypto').createHash('sha256').update(body).digest('hex') : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  var canonicalRequest = method + '\n' + path + '\n\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + payload
  var credentialScope = amzdate.slice(0, 8) + '/' + this.region + '/s3/aws4_request'
  var stringToSign = 'AWS4-HMAC-SHA256\n' + amzdate + '\n' + credentialScope + '\n' + require('crypto').createHash('sha256').update(canonicalRequest).digest('hex')
  var dateKey = require('crypto').createHmac('sha256', 'AWS4' + this.secretKey).update(amzdate.slice(0, 8)).digest()
  var regionKey = require('crypto').createHmac('sha256', dateKey).update(this.region).digest()
  var serviceKey = require('crypto').createHmac('sha256', regionKey).update('s3').digest()
  var signingKey = require('crypto').createHmac('sha256', serviceKey).update('aws4_request').digest()
  var signature = require('crypto').createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  headers['Authorization'] = 'AWS4-HMAC-SHA256 Credential=' + this.accessKey + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature
  return headers
}

S3Backend.prototype._request = function (method, key, body) {
  var path = '/' + encodeURIComponent(key)
  var headers = {}
  this._sign(method, path, headers, body)
  var url = this.endpoint + path
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
  var path = '/' + encodeURIComponent(key)
  var headers = {}
  this._sign('POST', path + '?uploads', headers)
  var url = this.endpoint + path + '?uploads'
  return fetch(url, { method: 'POST', headers: headers }).then(function (res) { return res.text() }).then(function (xml) {
    var uploadId = xml.match(/<UploadId>([^<]+)<\/UploadId>/)[1]
    var parts = []
    var numParts = Math.ceil(buf.length / self._partSize)
    for (var i = 0; i < numParts; i++) {
      var start = i * self._partSize
      var end = Math.min(start + self._partSize, buf.length)
      parts.push({ partNumber: i + 1, data: buf.slice(start, end) })
    }
    return Promise.all(parts.map(function (part) {
      var pheaders = {}
      self._sign('PUT', path + '?partNumber=' + part.partNumber + '&uploadId=' + uploadId, pheaders, part.data)
      var purl = self.endpoint + path + '?partNumber=' + part.partNumber + '&uploadId=' + uploadId
      return fetch(purl, { method: 'PUT', headers: pheaders, body: part.data }).then(function () {
        return '<Part><PartNumber>' + part.partNumber + '</PartNumber><ETag>"' + require('crypto').createHash('sha256').update(part.data).digest('hex') + '"</ETag></Part>'
      })
    })).then(function (partsXml) {
      var completeXml = '<CompleteMultipartUpload>' + partsXml.join('') + '</CompleteMultipartUpload>'
      var cheaders = {}
      self._sign('POST', path + '?uploadId=' + uploadId, cheaders, completeXml)
      var curl = self.endpoint + path + '?uploadId=' + uploadId
      return fetch(curl, { method: 'POST', headers: cheaders, body: completeXml })
    })
  }).then(function (res) {
    if (!res.ok) return res.text().then(function (t) { throw new Error('S3 multipart error: ' + t) })
  })
}

S3Backend.prototype.delete = function (p) {
  return this._request('DELETE', p).then(function (res) {
    if (!res.ok) return res.text().then(function (t) { throw new Error('S3 delete error: ' + t) })
  })
}

S3Backend.prototype.list = function (prefix) {
  var self = this
  var qs = '?list-type=2'
  if (prefix) qs += '&prefix=' + encodeURIComponent(prefix)
  var path = '/' + qs
  var headers = {}
  this._sign('GET', path, headers)
  var url = this.endpoint + path
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