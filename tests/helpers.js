'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function freePort() {
  return new Promise(res => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
}

// Stand-in for the Anthropic Messages API: records requests, answers by what was asked.
async function startMockClaude() {
  const requests = [];
  const port = await freePort();
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const body = JSON.parse(b || '{}');
      requests.push({ path: req.url, headers: req.headers, body });
      const sys = String(body.system || '');
      const last = body.messages[body.messages.length - 1];
      const lastText = typeof last.content === 'string' ? last.content : last.content.filter(x => x.type === 'text').map(x => x.text).join('');
      let text = 'Ответ ИИ: ' + lastText.slice(0, 40);
      if (sys.includes('Малохат')) text = 'Превенар-13 стоит 820 000 сум.';
      else if (sys.includes('JSON')) text = lastText.includes('Реши, кто из агентов')
        ? '```json\n{"plan":"Отвечаю сам","steps":[],"people":[]}\n```'
        : '{"kind":"Договор","folder":"10","title":"Договор аренды","date":"2026-01-15","number":"7","party":"ООО Тест","amount":150000,"expiry":"","notes":"","sensitive":false,"confidence":0.9,"warnings":[]}';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise(r => srv.listen(port, r));
  return { url: `http://127.0.0.1:${port}`, requests, stop: () => new Promise(r => srv.close(r)) };
}

async function startServer(env = {}) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'immunolab-test-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, OWNER_PIN: '1111', STAFF_PIN: '2222', SESSION_SECRET: 'test-secret', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start:\n' + log)), 10000);
    const on = d => { log += d; if (log.includes('Immunolab:')) { clearTimeout(t); resolve(); } };
    child.stdout.on('data', on); child.stderr.on('data', on);
    child.on('exit', c => { clearTimeout(t); reject(new Error('server exited ' + c + '\n' + log)); });
  });
  return {
    url: `http://127.0.0.1:${port}`, dataDir, log: () => log,
    stop: () => new Promise(r => { child.removeAllListeners('exit'); child.on('exit', r); child.kill('SIGTERM'); }),
  };
}

// plain static hosting of public/ with no API, like GitHub Pages
async function startStatic() {
  const port = await freePort();
  const pub = path.join(ROOT, 'public');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(pub, p);
    if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(port, r));
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise(r => srv.close(r)) };
}

async function api(base, method, p, body, token) {
  const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

module.exports = { ROOT, startMockClaude, startServer, startStatic, api };
