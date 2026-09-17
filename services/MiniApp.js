// ============================================================
// MINI HTTP APP - THAY EXPRESS BẰNG NODE.JS THUẦN
// ============================================================
// Mục tiêu: project chạy được ngay sau khi cài Node.js 22+,
// KHÔNG cần `npm install` bất kỳ thư viện ngoài nào.
//
// MiniApp chỉ cài những tính năng project này thật sự cần:
// - GET/POST/PATCH/DELETE
// - route param dạng /api/visits/:id
// - query string
// - JSON request/response
// - redirect
// - download file
// - phục vụ file tĩnh trong thư mục public

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function compilePath(pattern) {
  const keys = [];
  const escaped = pattern
    .split('/')
    .map((part) => {
      if (!part) return '';
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${escaped}$`), keys };
}

async function parseJsonBody(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error('Nội dung JSON gửi lên không hợp lệ.');
  }
}

class ResponseWrapper {
  constructor(res) {
    this.res = res;
    this.statusCode = 200;
  }

  status(code) {
    this.statusCode = Number(code) || 200;
    return this;
  }

  json(data) {
    if (this.res.writableEnded) return;
    const body = Buffer.from(JSON.stringify(data), 'utf8');
    this.res.writeHead(this.statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    this.res.end(body);
  }

  redirect(location) {
    if (this.res.writableEnded) return;
    this.res.writeHead(302, { Location: location });
    this.res.end();
  }

  download(filePath) {
    if (this.res.writableEnded) return;
    const stat = fs.statSync(filePath);
    this.res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`
    });
    fs.createReadStream(filePath).pipe(this.res);
  }
}

class MiniApp {
  constructor(publicDir) {
    this.publicDir = publicDir;
    this.routes = [];
  }

  add(method, pattern, handler) {
    const compiled = compilePath(pattern);
    this.routes.push({ method, pattern, ...compiled, handler });
  }

  get(pattern, handler) { this.add('GET', pattern, handler); }
  post(pattern, handler) { this.add('POST', pattern, handler); }
  patch(pattern, handler) { this.add('PATCH', pattern, handler); }
  delete(pattern, handler) { this.add('DELETE', pattern, handler); }

  async serveStatic(pathname, nodeRes) {
    let relative = decodeURIComponent(pathname);
    if (relative === '/') relative = '/index.html';
    const clean = path.normalize(relative).replace(/^([.][.][\\/])+/, '');
    const filePath = path.join(this.publicDir, clean);

    // Chặn path traversal.
    if (!filePath.startsWith(path.resolve(this.publicDir))) return false;
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    nodeRes.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // Luôn lấy file JS/CSS/HTML mới nhất khi sinh viên sửa code và restart server.
      // Tránh trình duyệt giữ queue.js/common.js của phiên bản cũ trên localhost.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(nodeRes);
    return true;
  }

  listen(port, callback) {
    const server = http.createServer(async (nodeReq, nodeRes) => {
      try {
        const url = new URL(nodeReq.url, `http://${nodeReq.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        for (const route of this.routes) {
          if (route.method !== nodeReq.method) continue;
          const match = pathname.match(route.regex);
          if (!match) continue;

          const params = {};
          route.keys.forEach((key, index) => { params[key] = decodeURIComponent(match[index + 1]); });
          nodeReq.params = params;
          nodeReq.query = Object.fromEntries(url.searchParams.entries());
          nodeReq.body = await parseJsonBody(nodeReq);
          const res = new ResponseWrapper(nodeRes);
          await route.handler(nodeReq, res);
          return;
        }

        if (nodeReq.method === 'GET' && await this.serveStatic(pathname, nodeRes)) return;

        const body = Buffer.from(JSON.stringify({ ok: false, message: 'Không tìm thấy đường dẫn.' }), 'utf8');
        nodeRes.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
        nodeRes.end(body);
      } catch (error) {
        if (!nodeRes.writableEnded) {
          const body = Buffer.from(JSON.stringify({ ok: false, message: error.message }), 'utf8');
          nodeRes.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
          nodeRes.end(body);
        }
      }
    });

    return server.listen(port, callback);
  }
}

module.exports = MiniApp;
