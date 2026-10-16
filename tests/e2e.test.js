'use strict';
// Browser tests: public website, staff app in demo mode (static hosting) and in server mode.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT, startMockClaude, startServer, startStatic } = require('./helpers');

const THREE = fs.readFileSync(path.join(ROOT, 'node_modules/three/build/three.min.js'), 'utf8');
let browser, claude, srv, srvNoAi, stat;

before(async () => {
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  claude = await startMockClaude();
  srv = await startServer({ ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: claude.url });
  srvNoAi = await startServer();
  stat = await startStatic();
});
after(async () => { await browser.close(); await srv.stop(); await srvNoAi.stop(); await stat.stop(); await claude.stop(); });

async function page(base, { mobile = false, storage } = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 800 } : { width: 1280, height: 860 }, serviceWorkers: 'block', locale: 'ru-RU', storageState: storage });
  // no internet in tests: three.js from node_modules, everything else external is dropped
  await ctx.route(/three\.min\.js/, r => r.fulfill({ body: THREE, contentType: 'application/javascript' }));
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  p.on('dialog', d => d.accept());
  return p;
}
const inMod = (p, mod, js, arg) => p.evaluate(([mod, js, arg]) => new Function('r', 'arg', js)(document.querySelector('#v_' + mod + ' .host').shadowRoot, arg), [mod, js, arg]);
const noWiderThanScreen = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('website: prices, search, languages, offline Malohat, phone layout', async () => {
  const p = await page(stat.url, { mobile: true });
  await p.goto(stat.url + '/');
  assert.equal(await p.locator('#plist li').count(), 15);
  await p.fill('#q', 'превенар');
  assert.equal(await p.locator('#plist li').count(), 1);
  assert.match(await p.locator('#plist li').innerText(), /820 000/);
  await p.click('.lang button[data-lang="uz"]');
  assert.match(await p.locator('h1').innerText(), /bitta binoda/);
  await p.click('.lang button[data-lang="ru"]');
  assert.ok(await noWiderThanScreen(p), 'no sideways scroll on a phone');
  await p.click('#fab');
  await p.fill('#chatIn', 'Сколько стоит грипп вакцина?');
  await p.press('#chatIn', 'Enter');
  await p.waitForFunction(() => /240 000/.test(document.querySelector('#msgs').innerText));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('website on the server: Malohat answers through Claude', async () => {
  const p = await page(srv.url);
  await p.goto(srv.url + '/');
  await p.click('#askBtn');
  await p.fill('#chatIn', 'Цена Превенар?');
  await p.press('#chatIn', 'Enter');
  await p.waitForFunction(() => /Превенар-13 стоит 820 000/.test(document.querySelector('#msgs').innerText));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('staff app, demo mode (no server): owner view, data kept in the browser', async () => {
  const p = await page(stat.url, { mobile: true });
  await p.goto(stat.url + '/app/');
  await p.waitForSelector('#t_dashboard');
  const tabs = await p.locator('#tabs .tab').allInnerTexts();
  assert.equal(tabs.length, 7, tabs.join('|'));
  assert.match(await p.locator('body').innerText(), /Демо-режим/);
  for (const f of ['agents', 'model3d', 'dashboard', 'school', 'problems', 'scanner']) {
    await p.click('#t_' + f);
    await p.waitForTimeout(f === 'model3d' ? 1500 : 300);
    assert.ok(await noWiderThanScreen(p), f + ' fits the phone');
  }
  await p.click('#t_dashboard');
  await inMod(p, 'dashboard', '[...r.querySelectorAll("#items button")].find(b=>b.dataset.k=="docs").click()');
  await p.waitForTimeout(200);
  await inMod(p, 'dashboard', 'const s=r.querySelector("select[data-did]");s.value="have";s.dispatchEvent(new Event("change",{bubbles:true}))');
  await p.waitForTimeout(300);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('imm_db_v1') || '{}')['docs/status']);
  assert.ok(saved && Object.values(saved.states).includes('have'), 'document mark saved');
  assert.deepEqual(p.errors.filter(e => !/WebGL|THREE/.test(e)), []);
  await p.context().close();
});

test('staff app, server mode: PIN login, own sections only, shared problems, AI agent', async () => {
  // staff member: registrar, no dashboard
  const s = await page(srv.url, { mobile: true });
  await s.goto(srv.url + '/app/');
  await s.waitForSelector('#immLogin select');
  await s.selectOption('#immLogin select', 'Каримова Гулчирой');
  await s.fill('#immLogin input', '0000');
  await s.click('#immLogin button');
  await s.waitForFunction(() => /Неверный PIN/.test(document.querySelector('#immLogin .err').textContent));
  await s.fill('#immLogin input', '2222');
  await s.click('#immLogin button');
  await s.waitForSelector('#t_problems');
  const tabs = await s.locator('#tabs .tab').evaluateAll(b => b.map(x => x.id));
  assert.ok(!tabs.includes('t_dashboard'), 'registrar has no dashboard: ' + tabs);
  assert.ok(tabs.includes('t_scanner'));
  assert.match(await s.locator('#meT').innerText(), /Каримова/);
  await s.click('#t_problems');
  await s.waitForTimeout(400);
  await inMod(s, 'problems', 'r.getElementById("txt").value="Не работает принтер";r.getElementById("send").click()');
  await s.waitForTimeout(600);
  assert.match(await inMod(s, 'problems', 'return r.getElementById("status").innerText'), /.+/);

  // owner sees the problem
  const o = await page(srv.url);
  await o.goto(srv.url + '/app/');
  await o.selectOption('#immLogin select', '__owner__');
  await o.fill('#immLogin input', '1111');
  await o.click('#immLogin button');
  await o.waitForSelector('#t_dashboard');
  await o.click('#t_problems');
  await o.waitForFunction(() => { const r = document.querySelector('#v_problems .host'); return r && /принтер/.test(r.shadowRoot.getElementById('adminList').innerText); }, null, { timeout: 8000 });

  // owner asks the marketer agent
  await o.click('#t_agents');
  await o.waitForTimeout(400);
  await inMod(o, 'agents', 'r.querySelector(\'.desk[data-id="marketer"]\').click()');
  await o.waitForTimeout(200);
  await inMod(o, 'agents', 'r.getElementById("q").value="Пост про грипп";[...r.querySelectorAll(".inrow .btn")].pop().click()');
  await o.waitForFunction(() => /Ответ ИИ/.test(document.querySelector('#v_agents .host').shadowRoot.getElementById('log').innerText), null, { timeout: 8000 });

  assert.deepEqual(s.errors, []);
  assert.deepEqual(o.errors.filter(e => !/WebGL|THREE/.test(e)), []);
  await s.context().close(); await o.context().close();
});

test('staff app on a server without an API key: works, AI features stay off', async () => {
  const o = await page(srvNoAi.url);
  await o.goto(srvNoAi.url + '/app/');
  await o.selectOption('#immLogin select', '__owner__');
  await o.fill('#immLogin input', '1111');
  await o.click('#immLogin button');
  await o.waitForSelector('#t_agents');
  assert.match(await o.locator('body').innerText(), /ИИ не подключён/);
  await o.click('#t_agents');
  await o.waitForTimeout(400);
  assert.match(await inMod(o, 'agents', 'return r.getElementById("sigTxt").textContent'), /ждут подключения к ИИ/);
  assert.deepEqual(o.errors, []);
  await o.context().close();
});
