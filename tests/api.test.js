'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startMockClaude, startServer, api } = require('./helpers');
const { parseJson, normalize } = require('../server/ai');

let claude, srv, owner, staff, staffUid;
before(async () => {
  claude = await startMockClaude();
  srv = await startServer({ ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: claude.url });
  owner = (await api(srv.url, 'POST', '/login', { owner: true, pin: '1111' })).body.token;
  const s = await api(srv.url, 'POST', '/login', { key: 'Каримова Гулчирой', pin: '2222' });
  staff = s.body.token; staffUid = s.body.user.uid;
});
after(async () => { await srv.stop(); await claude.stop(); });

test('health lists staff and reports AI', async () => {
  const r = await api(srv.url, 'GET', '/health');
  assert.equal(r.body.app, 'immunolab');
  assert.equal(r.body.ai, true);
  assert.equal(r.body.people.length, 20);
});

test('login rejects wrong PIN and unknown people', async () => {
  assert.equal((await api(srv.url, 'POST', '/login', { owner: true, pin: '0000' })).status, 401);
  assert.equal((await api(srv.url, 'POST', '/login', { key: 'Каримова Гулчирой', pin: '1111' })).status, 401);
  assert.equal((await api(srv.url, 'POST', '/login', { key: 'Никто', pin: '2222' })).status, 400);
});

test('requests without a valid token are refused', async () => {
  assert.equal((await api(srv.url, 'GET', '/db/doc?path=docs/status')).status, 401);
  assert.equal((await api(srv.url, 'GET', '/db/doc?path=docs/status', undefined, owner + 'x')).status, 401);
});

test('database rules match the Claude version', async () => {
  const put = (t, p, data) => api(srv.url, 'PUT', '/db/doc?path=' + encodeURIComponent(p), { data }, t);
  assert.equal((await put(staff, 'catalog/tests', { items: [] })).status, 403, 'staff cannot change prices');
  assert.equal((await put(owner, 'docs/status', { states: { a: 'have' } })).status, 200);
  assert.deepEqual((await api(srv.url, 'GET', '/db/doc?path=docs/status', undefined, staff)).body.data, { states: { a: 'have' } }, 'everyone reads documents status');
  assert.equal((await put(staff, 'problems/' + staffUid, { name: 'К', items: [{ text: 'принтер' }] })).status, 200);
  assert.equal((await put(staff, 'problems/u_someone', { items: [] })).status, 403, 'staff cannot write for others');
  assert.equal((await put(owner, 'problems/u_someone', { name: 'Другой', items: [] })).status, 200);
  assert.equal((await put(staff, 'scans/' + staffUid + '/items/a1', { title: 'Договор' })).status, 200);
  const mine = await api(srv.url, 'GET', '/db/list?path=problems', undefined, staff);
  assert.deepEqual(mine.body.docs.map(d => d.id), [staffUid], 'staff sees only own problems');
  const all = await api(srv.url, 'GET', '/db/list?path=problems', undefined, owner);
  assert.equal(all.body.docs.length, 2);
  const scans = await api(srv.url, 'GET', '/db/list?path=scans', undefined, owner);
  assert.deepEqual(scans.body.docs.map(d => d.id), [staffUid], 'parent ids of sub-collections are listed');
  assert.equal((await api(srv.url, 'GET', '/db/doc?path=a/../b', undefined, owner)).status, 400);
});

test('database is saved to disk and read back after a restart', async () => {
  await new Promise(r => setTimeout(r, 500)); // writes are batched for 300 ms
  assert.equal(JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'db.json'), 'utf8'))['docs/status'].states.a, 'have');
  const s2 = await startServer({ DATA_DIR: srv.dataDir });
  const t = (await api(s2.url, 'POST', '/login', { owner: true, pin: '1111' })).body.token;
  const r = await api(s2.url, 'GET', '/db/doc?path=docs/status', undefined, t);
  await s2.stop();
  assert.equal(r.body.data.states.a, 'have');
});

test('AI: text, JSON and images go to the Messages API', async () => {
  const r = await api(srv.url, 'POST', '/ai', { messages: [{ role: 'user', content: 'Привет' }] }, staff);
  assert.equal(r.status, 200);
  assert.match(r.body.text, /Ответ ИИ: Привет/);
  const req = claude.requests.at(-1);
  assert.equal(req.headers['x-api-key'], 'test-key');
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);

  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const j = await api(srv.url, 'POST', '/ai', { messages: 'Что за документ?', json: true, images: [png] }, staff);
  assert.equal(j.body.json.kind, 'Договор');
  const content = claude.requests.at(-1).body.messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/png');
});

test('Malohat answers the public without login, with the price list in the prompt', async () => {
  const r = await api(srv.url, 'POST', '/public/malohat', { messages: [{ role: 'user', content: 'Сколько стоит Превенар?' }], lang: 'ru' });
  assert.equal(r.status, 200);
  assert.match(r.body.text, /820 000/);
  const sys = claude.requests.at(-1).body.system;
  assert.match(sys, /Превенар-13/);
  assert.match(sys, /Не ставь диагнозы/);
});

test('parseJson and normalize', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Вот: {"a":[1,2]} готово'), { a: [1, 2] });
  assert.equal(parseJson('нет'), undefined);
  assert.deepEqual(normalize([{ role: 'assistant', content: 'x' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }]), [{ role: 'user', content: 'a\n\nb' }]);
});
