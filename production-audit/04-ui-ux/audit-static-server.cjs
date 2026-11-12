// Audit-only static server: serves frontend/dist with SPA fallback and proxies /api to the disposable backend on :8090.
const http = require('http'), fs = require('fs'), path = require('path')
const root = path.resolve('A:/Attendance/frontend/dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.bin': 'application/octet-stream' }
http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    const p = http.request({ host: '127.0.0.1', port: 8090, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
    p.on('error', () => { res.writeHead(502); res.end() }); req.pipe(p); return
  }
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]))
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html')
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
}).listen(5180, '127.0.0.1')
