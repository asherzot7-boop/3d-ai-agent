import re, json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT + '/src')
import guides
SRC = ['model3d', 'dashboard', 'school', 'problems', 'scanner']
LINKS = {
    'https://claude.ai/artifact/ChonjWtf1sH7Y3Bamtfrdi': '#go-model3d',
    'https://claude.ai/artifact/NJMcJaBSZAqJ6dqMEiuRLX': '#go-school',
    'https://claude.ai/artifact/B7bkpbDoH1sBkNTuiAPpRU': '#go-problems',
    'https://claude.ai/artifact/L1gfcmHbybJRDjt1JrqRBr': '#go-dashboard',
    'https://claude.ai/artifact/TEr354xkkiqrWcezS4M9eG': '#go-scanner',
}

def rep(h, a, b, n=1):
    c = h.count(a)
    assert c == n, (a[:60], c)
    return h.replace(a, b)

src = {k: open(ROOT + '/src/modules/' + k + '.html', encoding='utf-8').read() for k in SRC}
src['agents'] = open(ROOT + '/src/modules/agents.html', encoding='utf-8').read()

# ---- data fixes from the user
src['model3d'] = rep(src['model3d'], "6:['Прививочная',15,'d'],7:['Кабинет иммунолога',12,'d']",
                     "6:['Вакцинация и процедуры',15,'d'],7:['Вакцинация и процедуры',12,'d']")
src['dashboard'] = rep(src['dashboard'], '<b>6</b>Прививочная<br>', '<b>6</b>Вакцинация и процедуры<br>')
src['dashboard'] = rep(src['dashboard'], '<b>7</b>Иммунолог<br>Свободен', '<b>7</b>Вакцинация и процедуры<br><span class="up">Работает</span>')
src['dashboard'] = rep(src['dashboard'], "window.open(b.dataset.link,'_blank','noopener')", "__go(b.dataset.link)")
src['school'] = rep(src['school'],
    "['Для вакцинации пройдите к медсестре в прививочную (комната 6).',\"Emlash uchun hamshiraga, emlash xonasiga (6-xona) o'ting.\",'For vaccination, please go to the nurse in the vaccination room (room 6).']",
    "['Для вакцинации пройдите к медсестре в кабинет вакцинации (комнаты 6–7).',\"Emlash uchun hamshiraga, emlash xonasiga (6–7-xonalar) o'ting.\",'For vaccination, please go to the nurse in the vaccination room (rooms 6–7).']")
for k in src:
    for u, g in LINKS.items():
        src[k] = src[k].replace(u, g)

# ---- school becomes "Maktab" with training guides
DF = json.loads(re.search(r'const DF_=(\[.*?\]\]\]\]);', src['dashboard'], re.S).group(1))
by_resp = {}
for f in DF:
    for it in f[2]:
        by_resp.setdefault(it[2], []).append(it[1])
DUTY_JS = re.search(r'const DUTY=(\[.*?\]\]\]);', src['model3d'], re.S).group(1)
DUTY = json.loads(DUTY_JS.replace("'", '"'))
GUIDES = guides.build(DUTY, by_resp)
json.dump({'guides': GUIDES}, open(ROOT + '/data/guides.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

s = src['school']
s = rep(s, '<title>Школа регистратуры — Immunolab</title>', '<title>Мактаб Immunolab</title>')
s = rep(s, '<h1>Школа регистратуры Immunolab</h1>', '<h1>Мактаб Immunolab</h1>')
s = rep(s, '<p class="sub">Для регистратора и кассира: общение с клиентами на русском, узбекском и английском языках, приём оплаты (Humo, Uzcard, QR) и знание анализов лаборатории.</p>',
        '<p class="sub">Обучение для каждого сотрудника: пособие по должности на 5 дней, языки для общения с клиентами, оплата, анализы и тренажёр диалога.</p>')
s = rep(s, '<section id="t-lang">', '''<section id="t-learn">
 <div class="row" id="lPickRow"><label for="lPick" style="font-size:14px">Пособие для:</label><select id="lPick" style="flex:1;min-width:200px"></select></div>
 <div id="lBody"></div>
 <div class="card" id="lAdmin" hidden><h2>Прогресс сотрудников</h2><div id="lProg" class="sub" style="margin:0"></div></div>
</section>
<section id="t-lang" hidden>''')
s = rep(s, "const TABS=[['lang','Языки'],", "const TABS=[['learn','Обучение'],['lang','Языки'],")
s = rep(s, ".chat{max-height:340px;", """.lhead{display:grid;gap:4px}.lhead .meta{font-size:13px;color:var(--mut)}
.day{border-top:1px solid var(--line);padding:8px 0}.day:first-of-type{border-top:0}
.day h3{display:flex;justify-content:space-between;gap:8px;margin:0 0 4px}.day h3 span{font-size:12px;color:var(--mut);font-weight:500}
.tk{display:flex;gap:8px;align-items:flex-start;padding:4px 0;cursor:pointer}.tk input{margin-top:3px;width:17px;height:17px;flex:none;accent-color:var(--acc)}
.tk input:checked+span{color:var(--mut);text-decoration:line-through}
.pbar{height:7px;background:var(--line);border-radius:6px;overflow:hidden;margin-top:6px}.pbar i{display:block;height:100%;background:var(--ok)}
.qa{border-top:1px solid var(--line);padding:8px 0}.qa:first-child{border-top:0}.qa button{margin-top:4px;font-size:13px;padding:5px 10px}
.qa .ans{margin-top:4px;color:var(--ok)}
ul.plain{margin:4px 0 0 18px;padding:0}ul.plain li{margin:3px 0}
.chat{max-height:340px;""")
LEARN_JS = r'''
// ---- обучение: пособия по должностям
const GUIDES=__GUIDES__;
let LDB=null,LUID=null,LOWN=false,LOWNREAL=false,LDONE={},LSUB=null;
function lMe(){const I=window.__IMM||{};return I.me||null}
function lFill(){const s=$('lPick');s.textContent='';const me=lMe();
 const list=LOWN?GUIDES:GUIDES.filter(g=>g.key===me);
 (list.length?list:GUIDES).forEach(g=>{const o=document.createElement('option');o.value=g.key;o.textContent=g.full+' — '+g.role;s.appendChild(o)});
 if(me&&list.some(g=>g.key===me))s.value=me;
 $('lPickRow').hidden=!LOWN&&list.length===1;lRender()}
function lKey(g,i,j){return g.key+'|'+i+'|'+j}
async function lSave(){if(!LDB||!LUID)return;const me=lMe();let total=0,count=0;GUIDES.forEach(g=>{if(!LOWN&&g.key!==me)return;g.days.forEach((d,i)=>d.tasks.forEach((t,j)=>{total++;if(LDONE[lKey(g,i,j)])count++}))});
 try{await LDB.doc('training/'+LUID).set({name:me||'Владелец',done:LDONE,count,total,updated:Date.now()})}catch(e){}}
function lRender(){const g=GUIDES.find(x=>x.key===$('lPick').value)||GUIDES[0];const box=$('lBody');box.textContent='';
 const head=mk('div','card lhead');head.appendChild(mk('h2',null,g.full));
 head.appendChild(mk('div','meta',g.role+' · '+g.room+' · подчиняется: '+g.boss+' · пн–сб 8:00–17:00, обед 12:00–13:00'));
 head.appendChild(mk('div',null,g.purpose));
 const all=[];g.days.forEach((d,i)=>d.tasks.forEach((t,j)=>all.push(lKey(g,i,j))));const dn=all.filter(k=>LDONE[k]).length;
 const pr=mk('div','meta','Пройдено: '+dn+' из '+all.length);head.appendChild(pr);const pb=mk('div','pbar');const pi=mk('i');pi.style.width=(all.length?dn/all.length*100:0)+'%';pb.appendChild(pi);head.appendChild(pb);
 if(g.vacancy)head.appendChild(mk('div','meta','Это пособие для нового сотрудника на вакансию. Выдайте его в первый день работы.'));
 box.appendChild(head);
 const du=mk('div','card');du.appendChild(mk('h2',null,'Обязанности'));const ul=mk('ul','plain');g.duties.forEach(x=>ul.appendChild(mk('li',null,x)));du.appendChild(ul);
 du.appendChild(mk('div','sub','Черновик: окончательно утверждает руководитель.'));box.appendChild(du);
 const dc=mk('div','card');dc.appendChild(mk('h2',null,'План обучения на 5 дней'));
 g.days.forEach((d,i)=>{const w=mk('div','day');const h=mk('h3');h.appendChild(document.createTextNode('День '+(i+1)+'. '+d.t));const c=d.tasks.filter((t,j)=>LDONE[lKey(g,i,j)]).length;h.appendChild(mk('span',null,c+' / '+d.tasks.length));w.appendChild(h);
  d.tasks.forEach((t,j)=>{const k=lKey(g,i,j);const lab=mk('label','tk');const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!LDONE[k];
   const mine=LOWN||g.key===lMe();cb.disabled=!mine||!LDB;cb.onchange=()=>{LDONE[k]=cb.checked;lRender();lSave()};lab.appendChild(cb);lab.appendChild(mk('span',null,t));w.appendChild(lab)});dc.appendChild(w)});
 if(!LDB)dc.appendChild(mk('div','sub','Отметки сохраняются, когда страница открыта через Claude.'));
 box.appendChild(dc);
 const sf=mk('div','card');sf.appendChild(mk('h2',null,'Безопасность и правила'));const su=mk('ul','plain');g.safety.forEach(x=>su.appendChild(mk('li',null,x)));sf.appendChild(su);box.appendChild(sf);
 if(g.docs.length){const dd=mk('div','card');dd.appendChild(mk('h2',null,'Документы и журналы, за которые вы отвечаете'));const du2=mk('ul','plain');g.docs.forEach(x=>du2.appendChild(mk('li',null,x)));dd.appendChild(du2);box.appendChild(dd)}
 const qz=mk('div','card');qz.appendChild(mk('h2',null,'Проверьте себя'));g.quiz.forEach(q=>{const it=mk('div','qa');it.appendChild(mk('div',null,q.q));const b=mk('button',null,'Показать ответ');const a=mk('div','ans',q.a);a.hidden=true;b.onclick=()=>{a.hidden=!a.hidden;b.textContent=a.hidden?'Показать ответ':'Скрыть ответ'};it.appendChild(b);it.appendChild(a);qz.appendChild(it)});box.appendChild(qz)}
$('lPick').onchange=lRender;
async function lInit(){try{if(window.claude&&claude.use){LDB=await claude.use('db');const u=await claude.use('user');if(u){try{LUID=await u.id()}catch(e){}try{LOWN=await u.isOwner()}catch(e){}}}}catch(e){}
 LOWNREAL=LOWN;if(window.__IMM&&window.__IMM.preview)LOWN=false;
 lFill();
 if(LDB&&LUID)LDB.doc('training/'+LUID).onSnapshot(sn=>{LDONE=sn.exists?(sn.data().done||{}):{};lRender()},()=>{});
 if(LDB&&LOWNREAL){$('lAdmin').hidden=false;LDB.collection('training').onSnapshot(sn=>{const box=$('lProg');box.textContent='';const rows=sn.docs.map(d=>d.data()).filter(v=>v&&v.name);
  if(!rows.length){box.textContent='Пока никто не начал обучение.';return}
  rows.sort((a,b)=>(b.updated||0)-(a.updated||0)).forEach(v=>{const r=mk('div',null,v.name+': '+(v.count||0)+' из '+(v.total||0)+' · '+new Date(v.updated||0).toLocaleDateString('ru-RU'));box.appendChild(r)})},()=>{})}}
lFill();lInit();
window.addEventListener('imm-me',()=>{LOWN=(window.__IMM&&window.__IMM.preview)?false:LOWNREAL;lFill()});
'''.replace('__GUIDES__', json.dumps(GUIDES, ensure_ascii=False))
s = rep(s, '\ninit();\n</script>', '\ninit();\n' + LEARN_JS + '</script>')
src['school'] = s
DOCS = [[f[1], f[2]] for f in DF]
src['agents'] = src['agents'].replace('__GUIDES__', json.dumps(GUIDES, ensure_ascii=False)).replace('__DOCS__', json.dumps(DOCS, ensure_ascii=False))

# ---- split modules into style / body / scripts
def css_fix(c):
    c = c.replace('padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)', '')
    c = c.replace('@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){', '@media (prefers-color-scheme:dark){:host(:not(.th-light)){')
    c = c.replace(':root[data-theme="dark"]{', ':host(.th-dark){')
    c = c.replace(':root{', ':host{')
    c = re.sub(r'(^|[}\s])html,body\{', r'\1.mbody{', c)
    c = re.sub(r'(^|[}\s])html\{[^}]*\}', r'\1', c)
    c = re.sub(r'(^|[}\s])body\{', r'\1.mbody{', c)
    assert ':root' not in c and 'html{' not in c, c[:200]
    return c + '\n:host{display:block}.mbody{display:block;min-height:100%;background:var(--bg)}[hidden]{display:none!important}'

TPL, JS, EXT = [], [], set()
for k, h in src.items():
    styles = '\n'.join(re.findall(r'<style>(.*?)</style>', h, re.S))
    body = re.search(r'<body[^>]*>(.*)</body>', h, re.S).group(1)
    for m in re.finditer(r'<script src="([^"]+)"></script>', body):
        EXT.add(m.group(1))
    scripts = re.findall(r'<script>(.*?)</script>', body, re.S)
    body = re.sub(r'<script[^>]*>.*?</script>', '', body, flags=re.S)
    assert '</template>' not in body
    TPL.append('<template id="tpl_%s"><style>%s</style><div class="mbody">%s</div></template>' % (k, css_fix(styles), body))
    code = '\n;\n'.join(scripts)
    assert '</script' not in code
    JS.append('MODS[%s]=function(document,__go){\n%s\n};' % (json.dumps(k), code))

hub = open(ROOT + '/src/hub.html', encoding='utf-8').read()
hub = hub.replace('<!--EXT-->', '\n'.join('<script src="%s"></script>' % u for u in sorted(EXT)))
hub = hub.replace('<!--TEMPLATES-->', '\n'.join(TPL))
hub = hub.replace('/*MODULES*/', '\n'.join(JS))
hub = hub.replace('/*PEOPLE*/', json.dumps([{'key': g['key'], 'full': g['full'], 'role': g['role'], 'access': g['access'], 'vacancy': g['vacancy'], 'appday': g['appday']} for g in GUIDES], ensure_ascii=False))
os.makedirs(ROOT + '/app', exist_ok=True)
open(ROOT + '/app/immunolab-claude.html', 'w', encoding='utf-8').write(hub)
SKEL = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
open(ROOT + '/app/index.html', 'w', encoding='utf-8').write(SKEL + hub + '</body></html>')
print('ok', len(hub))
