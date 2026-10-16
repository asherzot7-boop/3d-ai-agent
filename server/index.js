// Immunolab server: serves the website and staff app, keeps the shared database,
// logs staff in with PIN codes and talks to Claude with the centre's API key.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('./env');
const { Store } = require('./store');
const { Ai } = require('./ai');
const { startTelegram } = require('./telegram');

const ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 8080);
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'storage');
const OWNER_PIN = process.env.OWNER_PIN || '';
const STAFF_PIN = process.env.STAFF_PIN || '';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

fs.mkdirSync(DATA_DIR, { recursive: true });
const store = new Store(path.join(DATA_DIR, 'db.json'));
const PEOPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'guides.json'), 'utf8')).guides
  .map(g => ({ key: g.key, full: g.full, role: g.role, vacancy: !!g.vacancy }));
const VACCINES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog_vaccines.json'), 'utf8')).items;
const SITE = readJson(path.join(ROOT, 'config', 'site.json'), {});
const ai = new Ai({ catalog: () => catalogItems(), site: SITE });

function readJson(p, d) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } }
function catalogItems() {
  const c = store.get('catalog/tests');
  return c && Array.isArray(c.items) && c.items.length ? c.items : VACCINES;
}

// ---------- PIN codes: storage/pins.json {"<person key>": "<sha256 of pin>"} (set with `npm run pin`)
const PINS_FILE = path.join(DATA_DIR, 'pins.json');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function pinOk(key, pin) {
  const pins = readJson(PINS_FILE, {});
  if (pins[key]) return safeEq(pins[key], sha(pin));
  return !!STAFF_PIN && safeEq(sha(STAFF_PIN), sha(pin));
}
function safeEq(a, b) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); }

// ---------- sessions: signed tokens, no server-side state
const uidFor = key => 'u_' + sha('immunolab:' + key).slice(0, 16);
function sign(user) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!safeEq(want, mac)) return null;
  const u = JSON.parse(Buffer.from(body, 'base64url').toString());
  return u.exp > Date.now() ? u : null;
}
const userOf = req => verify((req.headers.authorization || '').replace(/^Bearer /, ''));

// ---------- rate limits
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > windowMs) { b.n = 0; b.t = now; }
  b.n++; buckets.set(key, b);
  return b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 36e5) buckets.delete(k); }, 6e5).unref();
const ipOf = req => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress;

// ---------- database access rules (same as the Claude version)
// catalog/*, docs/*, office/*      read: everyone      write: owner
// problems|training|scans/{uid}/…  read/write: owner and that person
// anything else                    owner only
function canRead(u, p) {
  const s = p.split('/');
  if (u.owner) return true;
  if (['catalog', 'docs', 'office'].includes(s[0])) return true;
  return ['problems', 'training', 'scans'].includes(s[0]) && s[1] === u.uid;
}
function canWrite(u, p) {
  const s = p.split('/');
  if (u.owner) return true;
  return ['problems', 'training', 'scans'].includes(s[0]) && s[1] === u.uid;
}
function cleanPath(p) {
  const s = String(p || '').split('/').filter(Boolean);
  if (!s.length || s.length > 8 || s.some(x => x.length > 120 || x === '.' || x === '..')) return null;
  return s.join('/');
}

// ---------- HTTP helpers
function send(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(b);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (e) { reject(Object.assign(new Error('Неверный JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); return res.end(); }
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- API
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname.replace(/^\/api/, '');
  if (route === 'GET /health') return send(res, 200, { app: 'immunolab', ok: true, ai: ai.enabled, people: PEOPLE });

  if (route === 'POST /login') {
    if (limited('login:' + ipOf(req), 10, 10 * 6e4)) return send(res, 429, { error: 'Слишком много попыток. Подождите 10 минут.' });
    const b = await readBody(req, 4096), pin = String(b.pin || '');
    if (b.owner) {
      if (!OWNER_PIN) return send(res, 403, { error: 'На сервере не задан OWNER_PIN.' });
      if (!safeEq(sha(OWNER_PIN), sha(pin))) return send(res, 401, { error: 'Неверный PIN-код' });
      const user = { uid: 'owner', owner: true, name: 'Руководитель', key: null };
      return send(res, 200, { token: sign(user), user });
    }
    const p = PEOPLE.find(x => x.key === b.key);
    if (!p) return send(res, 400, { error: 'Сотрудник не найден' });
    if (!pinOk(p.key, pin)) return send(res, 401, { error: 'Неверный PIN-код' });
    const user = { uid: uidFor(p.key), owner: false, name: p.full, key: p.key };
    return send(res, 200, { token: sign(user), user });
  }

  if (route === 'POST /public/malohat') {
    if (!ai.enabled) return send(res, 503, { error: 'Консультант временно недоступен' });
    if (limited('malohat:' + ipOf(req), Number(process.env.MALOHAT_PER_HOUR || 30), 36e5)) return send(res, 429, { error: 'Слишком много сообщений. Попробуйте через час или позвоните нам.' });
    const b = await readBody(req, 20000);
    const text = await ai.malohat(b.messages, b.lang);
    return send(res, 200, { text });
  }

  const u = userOf(req);
  if (!u) return send(res, 401, { error: 'Войдите заново', code: 'unauthenticated' });

  if (route === 'GET /me') return send(res, 200, { user: { uid: u.uid, owner: u.owner, name: u.name, key: u.key } });
  if (route === 'GET /db/version') return send(res, 200, { version: store.version });

  if (url.pathname.startsWith('/api/db/')) {
    const p = cleanPath(url.searchParams.get('path'));
    if (!p) return send(res, 400, { error: 'Неверный путь' });
    if (route === 'GET /db/doc') {
      if (!canRead(u, p)) return send(res, 403, { error: 'Нет доступа', code: 'permission_denied' });
      const v = store.get(p); return send(res, 200, { data: v === undefined ? null : v });
    }
    if (route === 'GET /db/list') {
      const docs = store.list(p).filter(d => canRead(u, p + '/' + d.id))
        .map(d => ({ id: d.id, data: d.data === undefined ? null : d.data }));
      return send(res, 200, { docs });
    }
    if (route === 'PUT /db/doc') {
      if (!canWrite(u, p)) return send(res, 403, { error: 'Нет доступа', code: 'permission_denied' });
      const b = await readBody(req, 12 * 1024 * 1024);
      store.set(p, b.data); return send(res, 200, { ok: true });
    }
    if (route === 'DELETE /db/doc') {
      if (!canWrite(u, p)) return send(res, 403, { error: 'Нет доступа', code: 'permission_denied' });
      store.del(p); return send(res, 200, { ok: true });
    }
  }

  if (route === 'POST /ai') {
    if (!ai.enabled) return send(res, 503, { error: 'ИИ не подключён', code: 'no_ai' });
    if (limited('ai:' + u.uid, Number(process.env.AI_PER_HOUR || (u.owner ? 300 : 100)), 36e5)) return send(res, 429, { error: 'Лимит запросов к ИИ на этот час исчерпан' });
    const b = await readBody(req, 12 * 1024 * 1024);
    const r = await ai.complete(b);
    return send(res, 200, r);
  }
  return send(res, 404, { error: 'Не найдено' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    console.error(new Date().toISOString(), req.method, url.pathname, e.message);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Ошибка сервера', code: e.code });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Immunolab: http://localhost:${PORT}  (сайт /, приложение /app/)`);
    if (!OWNER_PIN) console.warn('! OWNER_PIN не задан — руководитель не сможет войти.');
    if (!STAFF_PIN && !fs.existsSync(PINS_FILE)) console.warn('! Нет PIN-кодов сотрудников: задайте STAFF_PIN или `npm run pin`.');
    if (!process.env.SESSION_SECRET) console.warn('! SESSION_SECRET не задан — после перезапуска все войдут заново.');
    console.log(ai.enabled ? `ИИ: ${ai.model}` : '! ИИ выключен: задайте ANTHROPIC_API_KEY.');
    if (process.env.TELEGRAM_BOT_TOKEN && ai.enabled) startTelegram(process.env.TELEGRAM_BOT_TOKEN, ai);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.flush(); process.exit(0); });
}
module.exports = { server, canRead, canWrite, cleanPath };
