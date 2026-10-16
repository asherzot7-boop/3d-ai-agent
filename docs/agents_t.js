const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-claude/36165568-1c1b-5ce8-ab2a-4cadad14a7a3/scratchpad';
const THREE = fs.readFileSync(SP + '/deps/node_modules/three/build/three.min.js', 'utf8');
const XL = fs.readFileSync(SP + '/deps/node_modules/xlsx/dist/xlsx.full.min.js', 'utf8');
const MOCK = fs.readFileSync(SP + '/test/mock.js', 'utf8');
const HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(SP + '/app2/out/index.html', 'utf8') + '</body></html>';
const sr = (p, js) => p.evaluate(js => new Function('r', js)(document.querySelector('#v_agents .host').shadowRoot), js);
(async () => {
  const b = await chromium.launch();
  for (const [role, ls, mobile] of [['owner', null, false], ['staff', { imm_me: 'Маликжонова Одина' }, true]]) {
    const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 820 } : { width: 1280, height: 900 } });
    await ctx.route('**/three.min.js', r => r.fulfill({ body: THREE, contentType: 'application/javascript' }));
    await ctx.route('**/xlsx.full.min.js', r => r.fulfill({ body: XL, contentType: 'application/javascript' }));
    await ctx.route(/fonts\.g/, r => r.abort());
    await ctx.route('http://app.test/', r => r.fulfill({ body: HTML, contentType: 'text/html; charset=utf-8' }));
    await ctx.addInitScript(`window.__ERR=[];addEventListener('error',e=>__ERR.push(e.message));window.__ROLE='${role}';` + MOCK +
      `;window.__STORE['catalog/tests']={items:[{id:'v11',name:'Превенар-13',cat:'Вакцинация',price:820000}]};const _u=window.claude.use;window.claude={use:async n=>{const c=await _u(n);if(n==='sample'&&c){const f=async(t,o)=>{window.__LAST=t;return c(t,o)};f.json=async(pr,o)=>{window.__PLANP=pr;if(/Реши, кто из агентов/.test(pr))return {plan:'Решаем через маркетинг и финансы',steps:[{agent:'marketer',task:'Идеи акций'},{agent:'finance',task:'Посчитать эффект'}],people:[{who:'Исматов Рустам',task:'Согласовать акцию с филиалами'}]};if(/планёрку/.test(pr))return {summary:'Главное: прайс анализов, журнал температуры.',tasks:[{agent:'doc',text:'Подготовить журнал температуры',to:'Комила'},{agent:'marketer',text:'Пост про Превенар-13',to:'агент'},{agent:'finance',text:'Посчитать маржу вакцин',to:'Директор'}]};return c.json(pr,o)};f.limits=c.limits;return f}return c}};` +
      (ls ? `localStorage.setItem('imm_me',${JSON.stringify(ls.imm_me)});` : ''));
    const p = await ctx.newPage();
    await p.goto('http://app.test/'); await p.waitForTimeout(800);
    await p.click('#t_agents'); await p.waitForTimeout(600);
    await p.waitForTimeout(3500);console.log(role,'plan:',await sr(p,'return r.getElementById("plan").innerText.slice(0,120)+" | tasks "+r.querySelectorAll("#tasks .task").length+" | badges "+[...r.querySelectorAll(".badge")].map(b=>b.textContent).join(",")'));
    console.log(role, 'desks:', await sr(p, 'return [...r.querySelectorAll(".desk b")].map(x=>x.textContent).join(",")+" | "+r.getElementById("sigTxt").textContent+" | статусы: "+[...r.querySelectorAll(".desk .status")].map(x=>x.textContent).join(",")'));
    await sr(p, 'r.querySelector(".chip").click()'); await p.waitForTimeout(1500);
    console.log(role, 'chat:', await sr(p, 'return [...r.querySelectorAll("#log .msg")].map(m=>m.textContent.slice(0,50)).join(" || ")'));
    console.log(role, 'prompt has price:', await p.evaluate(() => JSON.stringify(window.__LAST || '').includes('820')));
    if (role === 'owner') {
      await sr(p, '[...r.querySelectorAll(".desk")].find(d=>d.dataset.id=="analyst").click()'); await p.waitForTimeout(200);
      const wbuf = await p.evaluate(() => 1);
      // build an xlsx in node
      const XLSX = require(SP + '/deps/node_modules/xlsx');
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Анализ', 'Кол-во', 'Сумма'], ['ОАК', 12, 600000], ['Глюкоза', 5, 150000]]), 'День');
      XLSX.writeFile(wb, SP + '/test/day.xlsx');
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), sr(p, '[...r.querySelectorAll(".btn.sec")].find(b=>/Загрузить/.test(b.textContent)).click()')]);
      await fc.setFiles(SP + '/test/day.xlsx'); await p.waitForTimeout(600);
      console.log('analyst file:', await sr(p, 'return r.querySelector(".filebox").textContent'));
      await sr(p, 'r.querySelector(".chip").click()'); await p.waitForTimeout(500);
      console.log('analyst prompt has data:', await p.evaluate(() => JSON.stringify(window.__LAST || '').includes('Глюкоза')));
      await sr(p, '[...r.querySelectorAll(".desk")].find(d=>d.dataset.id=="doc").click()'); await p.waitForTimeout(200);
    }
    await p.screenshot({ path: SP + '/test/ag_' + role + '.png' });
    console.log(role, 'errors:', await p.evaluate(() => window.__ERR));
    const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); console.log(role, 'width', sw);
    await ctx.close();
  }
  await b.close();
})();
