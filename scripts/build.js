// Build: src/ + data/ + config/ → public/ (website + staff app) and claude/ (single file for claude.ai).
// Usage: node scripts/build.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const wr = (p, s) => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

const MODULES = ['model3d', 'dashboard', 'school', 'problems', 'scanner', 'agents'];
const src = Object.fromEntries(MODULES.map(k => [k, rd('src/modules/' + k + '.html')]));
const GUIDES = JSON.parse(rd('data/guides.json')).guides;
const SITE = JSON.parse(rd('config/site.json'));
const VACCINES = JSON.parse(rd('data/catalog_vaccines.json')).items;

// documents checklist from the dashboard source, for the Document agent
const dfm = /const DF_=(\[[\s\S]*?\]\]\]\]);/.exec(src.dashboard);
if (!dfm) throw new Error('DF_ not found in dashboard.html');
const DOCS = JSON.parse(dfm[1]).map(f => [f[1], f[2]]);

const fill = (s, key, val) => { if (!s.includes(key)) throw new Error(key + ' missing'); return s.split(key).join(val); };
src.school = fill(src.school, '__GUIDES__', json(GUIDES));
src.agents = fill(fill(src.agents, '__GUIDES__', json(GUIDES)), '__DOCS__', json(DOCS));

// ---- each module becomes <template> + function(document, __go) running inside its own shadow root
function cssFix(c) {
  c = c.split('padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)').join('');
  c = c.split('@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){').join('@media (prefers-color-scheme:dark){:host(:not(.th-light)){');
  c = c.split(':root[data-theme="dark"]{').join(':host(.th-dark){');
  c = c.split(':root{').join(':host{');
  c = c.replace(/(^|[}\s])html,body\{/g, '$1.mbody{');
  c = c.replace(/(^|[}\s])html\{[^}]*\}/g, '$1');
  c = c.replace(/(^|[}\s])body\{/g, '$1.mbody{');
  if (c.includes(':root') || c.includes('html{')) throw new Error('unscoped CSS left: ' + c.slice(0, 200));
  return c + '\n:host{display:block}.mbody{display:block;min-height:100%;background:var(--bg)}[hidden]{display:none!important}';
}
const TPL = [], JS = [], EXT = new Set();
for (const k of MODULES) {
  const h = src[k];
  const styles = [...h.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  let body = /<body[^>]*>([\s\S]*)<\/body>/.exec(h)[1];
  for (const m of body.matchAll(/<script src="([^"]+)"><\/script>/g)) EXT.add(m[1]);
  const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  if (body.includes('</template>')) throw new Error(k + ': </template> in body');
  TPL.push(`<template id="tpl_${k}"><style>${cssFix(styles)}</style><div class="mbody">${body}</div></template>`);
  const code = scripts.join('\n;\n');
  if (code.includes('</script')) throw new Error(k + ': </script in code');
  JS.push(`MODS[${JSON.stringify(k)}]=function(document,__go){\n${code}\n};`);
}
const PEOPLE = GUIDES.map(g => ({ key: g.key, full: g.full, role: g.role, access: g.access, vacancy: g.vacancy, appday: g.appday }));
let hub = rd('src/hub.html');
hub = hub.replace('<!--EXT-->', () => [...EXT].sort().map(u => `<script src="${u}"></script>`).join('\n'));
hub = hub.replace('<!--TEMPLATES-->', () => TPL.join('\n'));
hub = hub.replace('/*MODULES*/', () => JS.join('\n'));
hub = hub.replace('/*PEOPLE*/', () => json(PEOPLE));

// content hash: changes only when the app changes (cache busting, service worker)
const BUILD = require('crypto').createHash('sha1').update(hub + rd('src/web/runtime.js') + rd('src/web/sw.js')).digest('hex').slice(0, 10);

// ---- claude.ai version (published by the owner as a Claude artifact)
wr('claude/immunolab-claude.html', hub);

// ---- standalone staff app: public/app/
const appHead = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d7f74"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Immunolab"><meta name="robots" content="noindex">
<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="icon.svg">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html,body{height:100%}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="config.js?v=${BUILD}"></script>
<script src="runtime.js?v=${BUILD}"></script>
<script>if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));</script>
</head><body>`;
wr('public/app/index.html', appHead + hub + '</body></html>');
wr('public/app/runtime.js', rd('src/web/runtime.js'));
wr('public/app/config.js', `// Где искать сервер Immunolab. По умолчанию — рядом с приложением (../api).\nwindow.IMMUNOLAB_CONFIG=${JSON.stringify({ api: '../api' })};\n`);
wr('public/app/manifest.webmanifest', rd('src/web/manifest.webmanifest'));
wr('public/app/icon.svg', rd('src/web/icon.svg'));
wr('public/app/sw.js', rd('src/web/sw.js').replace('__BUILD__', BUILD));

// ---- public website: public/index.html
const site = rd('src/web/site.html');
const cut = site.indexOf('<!--/head-->');
if (cut < 0) throw new Error('site.html: <!--/head--> marker missing');
const siteCfg = Object.fromEntries(Object.entries(SITE).filter(([k]) => !k.startsWith('_')));
const siteBody = site.slice(cut + 12)
  .replace('/*SITE_CONFIG*/{}', () => json(siteCfg))
  .replace('/*CATALOG*/[]', () => json(VACCINES.map(i => ({ name: i.name, prep: i.prep, price: i.price }))));
const siteHead = site.slice(0, cut);
wr('public/index.html', `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}img{max-width:100%}</style>\n${siteHead}</head><body>${siteBody}</body></html>`);
// artifact-style copy (no document skeleton) for previews on claude.ai
wr('claude/site-preview.html', siteHead + siteBody.replace(/href="app\/"/g, 'href="#contacts"').replace('href="app/icon.svg"', 'href="data:,"'));
wr('public/robots.txt', 'User-agent: *\nDisallow: /app/\nDisallow: /api/\n');
wr('public/.nojekyll', '');

console.log(`ok · build ${BUILD} · app ${(hub.length / 1024).toFixed(0)} KB · site ${(siteBody.length / 1024).toFixed(0)} KB`);
