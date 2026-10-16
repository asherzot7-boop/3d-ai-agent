/* Immunolab standalone runtime.
 * The app was written against window.claude (db, user, sample, downloads) inside claude.ai.
 * Outside Claude this file provides the same interface:
 *   - server mode: the Immunolab server (server/index.js) — shared database, PIN login, AI through the centre's API key;
 *   - demo mode: no server reachable (e.g. GitHub Pages) — data stays in this browser, AI is off.
 * Inside Claude it does nothing. */
(function () {
  'use strict';
  if (window.claude && window.claude.use) return;

  const CFG = window.IMMUNOLAB_CONFIG || {};
  const API = (CFG.api || '/api').replace(/\/$/, '');
  const TOKEN_KEY = 'imm_token';
  const POLL_MS = CFG.pollMs || 4000;
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const segs = p => String(p).split('/').filter(Boolean);

  // ---------- backends: get / set / del / list / version
  function localBackend() {
    const KEY = 'imm_db_v1';
    const load = () => { try { return JSON.parse(LS.get(KEY) || '{}') || {}; } catch (e) { return {}; } };
    const save = s => LS.set(KEY, JSON.stringify(s));
    return {
      async get(path) { return clone(load()[path]); },
      async set(path, v) { const s = load(); s[path] = clone(v); save(s); },
      async del(path) { const s = load(); delete s[path]; save(s); },
      async list(path) { return listFrom(load(), path); },
      async version() { return LS.get(KEY) || ''; },
    };
  }
  function listFrom(store, path) {
    const base = segs(path), depth = base.length + 1, prefix = base.join('/') + '/';
    const ids = new Set();
    Object.keys(store).forEach(k => { if (k.startsWith(prefix)) { const s = segs(k); if (s.length >= depth) ids.add(s[depth - 1]); } });
    return [...ids].map(id => ({ id, data: clone(store[prefix + id]) }));
  }
  function serverBackend() {
    return {
      async get(path) { const r = await call('GET', '/db/doc?path=' + encodeURIComponent(path)); return r.data === null ? undefined : r.data; },
      async set(path, v) { await call('PUT', '/db/doc?path=' + encodeURIComponent(path), { data: v }); },
      async del(path) { await call('DELETE', '/db/doc?path=' + encodeURIComponent(path)); },
      async list(path) { const r = await call('GET', '/db/list?path=' + encodeURIComponent(path)); return r.docs.map(d => ({ id: d.id, data: d.data === null ? undefined : d.data })); },
      async version() { const r = await call('GET', '/db/version'); return String(r.version); },
    };
  }

  // ---------- HTTP
  async function call(method, path, body) {
    const h = { 'Content-Type': 'application/json' };
    const t = LS.get(TOKEN_KEY);
    if (t) h.Authorization = 'Bearer ' + t;
    const r = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      const e = new Error((j && j.error) || ('HTTP ' + r.status));
      e.code = (j && j.code) || (r.status === 401 ? 'unauthenticated' : r.status === 403 ? 'permission_denied' : r.status === 429 ? 'rate_limited' : 'http_' + r.status);
      if (r.status === 401 && t) { LS.del(TOKEN_KEY); }
      throw e;
    }
    return j || {};
  }

  // ---------- Firestore-like db on top of a backend
  function makeDb(be) {
    const subs = new Set();
    let ver = null;
    async function refresh(s) {
      try {
        const v = s.kind === 'doc' ? await be.get(s.path) : await be.list(s.path);
        const key = JSON.stringify(v === undefined ? null : v);
        if (key === s.last) return;
        s.last = key;
        s.cb(s.kind === 'doc' ? docSnap(s.path, v) : colSnap(s.path, v));
      } catch (e) { if (s.err) try { s.err(e); } catch (x) {} }
    }
    const refreshAll = () => subs.forEach(refresh);
    function docSnap(path, v) { return { exists: v !== undefined && v !== null, id: segs(path).pop(), ref: doc(path), data: () => clone(v === null ? undefined : v) }; }
    function colSnap(path, list) {
      const docs = list.map(d => docSnap(path + '/' + d.id, d.data));
      return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
    }
    async function wrote() { refreshAll(); }
    function doc(path) {
      path = segs(path).join('/');
      return {
        id: segs(path).pop(), path,
        async get() { return docSnap(path, await be.get(path)); },
        async set(v, opt) { if (opt && opt.merge) { const o = (await be.get(path)) || {}; v = Object.assign({}, o, v); } await be.set(path, v); wrote(); },
        async update(v) { const o = (await be.get(path)) || {}; await be.set(path, Object.assign({}, o, v)); wrote(); },
        async delete() { await be.del(path); wrote(); },
        onSnapshot(cb, err) { const s = { kind: 'doc', path, cb, err, last: undefined }; subs.add(s); refresh(s); return () => subs.delete(s); },
        collection(name) { return collection(path + '/' + name); },
      };
    }
    function collection(path) {
      path = segs(path).join('/');
      return {
        path,
        async get() { return colSnap(path, await be.list(path)); },
        doc(id) { return doc(path + '/' + (id || Math.random().toString(36).slice(2, 12))); },
        async add(v) { const d = doc(path + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); await d.set(v); return d; },
        onSnapshot(cb, err) { const s = { kind: 'col', path, cb, err, last: undefined }; subs.add(s); refresh(s); return () => subs.delete(s); },
      };
    }
    // pick up other people's changes
    setInterval(async () => {
      if (!subs.size || document.hidden) return;
      try { const v = await be.version(); if (v !== ver) { ver = v; refreshAll(); } } catch (e) {}
    }, POLL_MS);
    window.addEventListener('storage', e => { if (e.key === 'imm_db_v1') refreshAll(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); });
    return { doc, collection };
  }

  // ---------- AI
  function makeSample() {
    const norm = t => (typeof t === 'string' ? [{ role: 'user', content: t }] : t);
    async function sample(turns, opts) {
      opts = opts || {};
      const r = await call('POST', '/ai', { messages: norm(turns), images: opts.images, system: opts.system, maxTokens: opts.maxTokens });
      if (opts.onText) try { opts.onText({ text: r.text }); } catch (e) {}
      return { text: r.text };
    }
    sample.json = async (turns, opts) => {
      opts = opts || {};
      const r = await call('POST', '/ai', { messages: norm(turns), images: opts.images, system: opts.system, json: true, maxTokens: opts.maxTokens });
      return r.json;
    };
    sample.limits = async () => ({ images: true });
    return sample;
  }

  // ---------- downloads
  const downloads = {
    async save(o) {
      const blob = o.data instanceof Blob ? o.data : new Blob([o.data == null ? '' : o.data], { type: o.mimeType || 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = o.filename || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
  };

  // ---------- login screen (server mode)
  function loginScreen(health) {
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.id = 'immLogin';
      box.innerHTML = '<style>#immLogin{position:fixed;inset:0;z-index:99999;background:var(--bg,#eef3f6);color:var(--ink,#132a3d);font-family:"Golos Text",system-ui,sans-serif;display:grid;place-items:center;padding:16px;overflow:auto}' +
        '#immLogin form{background:var(--surface,#fff);border:1px solid var(--line,#d6e0e7);border-radius:14px;padding:20px;display:grid;gap:12px;width:100%;max-width:420px;min-width:0}#immLogin label{min-width:0}' +
        '#immLogin h1{font-family:Unbounded,"Golos Text",system-ui,sans-serif;font-size:20px;margin:0}#immLogin p{margin:0;color:var(--muted,#5a6f80);font-size:14px}' +
        '#immLogin label{display:grid;gap:6px;font-size:13px;color:var(--muted,#5a6f80)}#immLogin select,#immLogin input{width:100%;min-width:0;max-width:100%;font:inherit;font-size:16px;padding:10px;border-radius:8px;border:1px solid var(--line,#d6e0e7);background:var(--bg,#eef3f6);color:var(--ink,#132a3d)}' +
        '#immLogin button{font:inherit;font-weight:600;background:var(--accent,#0d7f74);color:var(--on-accent,#fff);border:0;border-radius:8px;padding:11px;cursor:pointer}#immLogin .err{color:#b3261e;font-size:14px;min-height:1em}</style>' +
        '<form><h1>Immunolab</h1><p>Kirish · Вход для сотрудников</p>' +
        '<label>Ism · Кто вы<select name="who" required></select></label>' +
        '<label>PIN-kod · PIN-код<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>' +
        '<div class="err" role="alert"></div><button type="submit">Kirish · Войти</button>' +
        '<p>PIN-kodni rahbardan oling · PIN-код выдаёт руководитель.</p></form>';
      const sel = box.querySelector('select');
      const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
      opt('', '— tanlang · выберите —');
      opt('__owner__', 'Rahbar · Руководитель');
      (health.people || []).forEach(p => opt(p.key, p.full + ' — ' + p.role));
      const last = LS.get('imm_me'); if (last) sel.value = last;
      box.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        const err = box.querySelector('.err'); err.textContent = '';
        const who = sel.value, pin = box.querySelector('input').value.trim();
        if (!who) { err.textContent = 'Выберите имя'; return; }
        try {
          const r = await call('POST', '/login', who === '__owner__' ? { owner: true, pin } : { key: who, pin });
          LS.set(TOKEN_KEY, r.token);
          box.remove(); resolve(r.user);
        } catch (e) { err.textContent = e.message || 'Не получилось войти'; }
      };
      const mount = () => document.body.appendChild(box);
      if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
    });
  }

  function banner(text) {
    const b = document.createElement('div');
    b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;max-width:calc(100% - 16px);font:12px/1.4 "Golos Text",system-ui,sans-serif;background:#fff6e5;color:#5c3b00;border:1px solid #f0d199;border-radius:8px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,.08)';
    b.textContent = text;
    const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Закрыть');
    x.style.cssText = 'margin-left:8px;border:0;background:none;font:inherit;font-size:16px;cursor:pointer;color:inherit';
    x.onclick = () => b.remove(); b.appendChild(x);
    const mount = () => document.body.appendChild(b);
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  }

  // ---------- boot
  const ready = (async () => {
    let health = null;
    try {
      const r = await fetch(API + '/health', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.app === 'immunolab') health = j; }
    } catch (e) {}

    if (!health) {
      banner('Демо-режим: данные хранятся только в этом браузере, ИИ отключён. Для общей базы запустите сервер Immunolab.');
      const caps = { db: makeDb(localBackend()), downloads, sample: null };
      caps.user = { id: async () => 'demo_owner', isOwner: async () => true, canEdit: async () => true, name: async () => 'Демо' };
      return caps;
    }

    let me = null;
    if (LS.get(TOKEN_KEY)) { try { me = (await call('GET', '/me')).user; } catch (e) { me = null; } }
    if (!me) me = await loginScreen(health);

    window.__immLogout = () => { LS.del(TOKEN_KEY); LS.del('imm_me'); location.reload(); };
    const caps = { db: makeDb(serverBackend()), downloads, sample: health.ai ? makeSample() : null };
    caps.user = {
      id: async () => me.uid,
      isOwner: async () => !!me.owner,
      canEdit: async () => !!me.owner,
      name: async () => me.name,
      staffKey: async () => me.key || null,
    };
    if (!health.ai) banner('ИИ не подключён: на сервере не задан ANTHROPIC_API_KEY.');
    return caps;
  })();

  window.claude = { use: async name => { const caps = await ready; return caps[name] || null; }, standalone: true };
})();
