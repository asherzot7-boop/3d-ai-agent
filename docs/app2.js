const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-claude/36165568-1c1b-5ce8-ab2a-4cadad14a7a3/scratchpad';
const THREE = fs.readFileSync(SP + '/deps/node_modules/three/build/three.min.js', 'utf8');
const MOCK = fs.readFileSync(SP + '/test/mock.js', 'utf8');
const HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(SP + '/app2/out/index.html', 'utf8') + '</body></html>';
const log = m => console.log(m);
const sr = (p, f, js) => p.evaluate(([f, js]) => { const r = document.querySelector('#v_' + f + ' .host').shadowRoot; return new Function('r', js)(r); }, [f, js]);

async function ctxFor(b, role, mobile, ls) {
  const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 800 } : { width: 1280, height: 860 } });
  await ctx.route('**/three.min.js', r => r.fulfill({ body: THREE, contentType: 'application/javascript' }));
  await ctx.route(/fonts\.g/, r => r.abort());
  await ctx.route('http://app.test/', r => r.fulfill({ body: HTML, contentType: 'text/html; charset=utf-8' }));
  await ctx.addInitScript(`window.__ERR=[];window.addEventListener('error',e=>window.__ERR.push(e.message));window.addEventListener('unhandledrejection',e=>window.__ERR.push('rej '+(e.reason&&e.reason.message)));window.__ROLE=${JSON.stringify(role)};` + MOCK + (ls ? `;try{${Object.entries(ls).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)})`).join(';')}}catch(e){}` : ''));
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  await p.goto('http://app.test/'); await p.waitForTimeout(700);
  return { ctx, p };
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // ===== OWNER, phone
  {
    const { ctx, p } = await ctxFor(b, 'owner', true);
    log('OWNER tabs: ' + (await p.locator('#tabs .tab').allInnerTexts()).join(' | '));
    log('ownerBox visible: ' + await p.locator('#ownerBox').isVisible() + ', whoBox: ' + await p.locator('#whoBox').isVisible());
    for (const f of ['model3d', 'dashboard', 'school', 'problems', 'scanner']) {
      await p.click('#t_' + f); await p.waitForTimeout(f === 'model3d' ? 2500 : 800);
      const txt = await sr(p, f, 'return r.querySelector(".mbody").innerText.slice(0,300)');
      if (/только при открытии|Нет доступа/.test(txt)) log(f + ': НЕТ ДОСТУПА К CLAUDE');
      const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); if (sw[0] > sw[1]) log(f + ' wider ' + sw);
      await p.screenshot({ path: SP + '/test/b_' + f + '.png' });
    }
    // dashboard docs mark
    await p.click('#t_dashboard'); await p.waitForTimeout(300);
    await sr(p, 'dashboard', '[...r.querySelectorAll("#items button")].find(b=>b.dataset.k=="docs").click()'); await p.waitForTimeout(300);
    await sr(p, 'dashboard', 'const s=r.querySelector("select[data-did]");s.value="have";s.dispatchEvent(new Event("change",{bubbles:true}))'); await p.waitForTimeout(300);
    log('dashboard docs saved: ' + JSON.stringify(await p.evaluate(() => window.__STORE['docs/status'] && window.__STORE['docs/status'].states)));
    // problems
    await p.click('#t_problems'); await p.waitForTimeout(200);
    await sr(p, 'problems', 'r.getElementById("txt").value="Тест принтер";r.getElementById("send").click()'); await p.waitForTimeout(400);
    log('problems: ' + await sr(p, 'problems', 'return r.getElementById("status").innerText+" / admin items "+r.querySelectorAll("#adminList .item").length'));
    // scanner: photo button opens chooser
    await p.click('#t_scanner'); await p.waitForTimeout(300);
    const vis = await sr(p, 'scanner', 'return [!r.getElementById("main").hidden, !r.getElementById("who").hidden, r.getElementById("msg").innerText]');
    log('scanner main/who/msg: ' + JSON.stringify(vis));
    if (!vis[0] && vis[1]) { await sr(p, 'scanner', 'r.getElementById("whoSel").value="Саидов Дилмурод";r.getElementById("whoBtn").click()'); await p.waitForTimeout(300); }
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), sr(p, 'scanner', 'r.getElementById("shot").click()')]);
    log('scanner photo button opens chooser: ' + !!fc);
    if (fc) { await fc.setFiles(SP + '/test/doc.png'); await p.waitForTimeout(1500); }
    log('scanner AI folder: ' + await sr(p, 'scanner', 'return r.getElementById("fFolder").value+" / "+r.getElementById("fTitle").value'));
    await sr(p, 'scanner', 'r.getElementById("save").click()'); await p.waitForTimeout(800);
    await sr(p, 'scanner', '[...r.querySelectorAll(".tabs button")].find(b=>b.dataset.t=="all").click()'); await p.waitForTimeout(500);
    log('scanner msg: ' + await sr(p, 'scanner', 'return r.getElementById("msg").innerText') + ' / архив: ' + await sr(p, 'scanner', 'return r.querySelectorAll("#allList .item").length'));
    // school learn
    await p.click('#t_school'); await p.waitForTimeout(300);
    log('school h1: ' + await sr(p, 'school', 'return r.querySelector("h1").innerText+" | tabs: "+[...r.querySelectorAll("#tabs button")].map(b=>b.innerText).join(",")+" | guides "+r.getElementById("lPick").options.length'));
    await sr(p, 'school', 'const s=r.getElementById("lPick");s.value="Тожимирзаева Комила";s.dispatchEvent(new Event("change"))');
    await sr(p, 'school', 'r.querySelector("#lBody .tk input").click()'); await p.waitForTimeout(300);
    log('school training saved: ' + JSON.stringify(await p.evaluate(() => { const d = window.__STORE['training/u_owner']; return d && [d.count, d.total, Object.keys(d.done)]; })));
    await p.screenshot({ path: SP + '/test/b_school_learn.png' });
    // preview as staff
    await p.click('#t_home'); await p.selectOption('#asSel', 'Каримова Гулчирой'); await p.waitForTimeout(300);
    log('preview Гулчирой tabs: ' + (await p.locator('#tabs .tab').allInnerTexts()).join(' | '));
    await p.selectOption('#asSel', 'Ахмедов Шерзод'); await p.waitForTimeout(300);
    log('preview Шерзод tabs: ' + (await p.locator('#tabs .tab').allInnerTexts()).join(' | '));
    await p.selectOption('#asSel', ''); await p.waitForTimeout(200);
    log('back to owner tabs: ' + (await p.locator('#tabs .tab').count()));
    const errs = await p.evaluate(() => window.__ERR); errs.forEach(e => log('OWNER ERR: ' + e));
    await ctx.close();
  }
  // ===== STAFF new, phone
  {
    const { ctx, p } = await ctxFor(b, 'staff', true);
    log('STAFF first: whoBox ' + await p.locator('#whoBox').isVisible() + ' tabs ' + (await p.locator('#tabs .tab').allInnerTexts()).join('|'));
    await p.selectOption('#whoSel', 'Маликжонова Одина'); await p.click('#whoBtn'); await p.waitForTimeout(300);
    log('STAFF tabs: ' + (await p.locator('#tabs .tab').allInnerTexts()).join(' | ') + ' | meBox ' + await p.locator('#meBox').isVisible());
    await p.screenshot({ path: SP + '/test/b_staff_home.png' });
    await p.click('#t_school'); await p.waitForTimeout(400);
    log('STAFF school guides: ' + await sr(p, 'school', 'return r.getElementById("lPick").options.length+" row hidden "+r.getElementById("lPickRow").hidden+" admin "+!r.getElementById("lAdmin").hidden'));
    await sr(p, 'school', 'r.querySelector("#lBody .tk input").click()'); await p.waitForTimeout(300);
    log('STAFF training saved: ' + JSON.stringify(await p.evaluate(() => { const d = window.__STORE['training/u_staff1']; return d && [d.name, d.count, d.total]; })));
    await p.screenshot({ path: SP + '/test/b_staff_school.png' });
    await p.click('#t_problems'); await p.waitForTimeout(300);
    log('STAFF problems who: ' + await sr(p, 'problems', 'const s=r.getElementById("who");return s.options[s.selectedIndex].text+" admin:"+!r.getElementById("admin").hidden'));
    await p.click('#t_scanner'); await p.waitForTimeout(400);
    log('STAFF scanner: main ' + await sr(p, 'scanner', 'return !r.getElementById("main").hidden+" who "+!r.getElementById("who").hidden'));
    const errs = await p.evaluate(() => window.__ERR); errs.forEach(e => log('STAFF ERR: ' + e));
    await ctx.close();
  }
  await b.close();
})();
