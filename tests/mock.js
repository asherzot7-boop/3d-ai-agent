// Mock of window.claude for local testing. Role set via window.__ROLE ('owner' | 'staff').
(function(){
  const role = window.__ROLE || 'owner';
  const store = window.__STORE = {};
  const subs = [];
  const notify = () => subs.forEach(s => s());
  function snapDoc(path){ const v = store[path]; return {exists: v!==undefined, id: path.split('/').pop(), data: () => v ? JSON.parse(JSON.stringify(v)) : undefined}; }
  function doc(path){ return {
    get: async () => snapDoc(path),
    set: async (v) => { store[path] = JSON.parse(JSON.stringify(v)); notify(); },
    update: async (v) => { store[path] = Object.assign({}, store[path]||{}, v); notify(); },
    delete: async () => { delete store[path]; notify(); },
    onSnapshot: (cb, err) => { const f = () => cb(snapDoc(path)); subs.push(f); setTimeout(f,0); return () => {}; }
  };}
  function collection(path){
    const depth = path.split('/').length + 1;
    const list = () => Object.keys(store).filter(k => k.startsWith(path+'/') && k.split('/').length === depth).map(k => snapDoc(k));
    // also include "parent" docs implied by subcollections
    const implied = () => { const ids = new Set(list().map(d=>d.id)); Object.keys(store).forEach(k=>{ if(k.startsWith(path+'/')){ const id=k.split('/')[depth-1]; if(!ids.has(id)){ids.add(id);} } }); return [...ids].map(id=>snapDoc(path+'/'+id)); };
    return {
      get: async () => ({docs: implied()}),
      onSnapshot: (cb) => { const f = () => cb({docs: implied()}); subs.push(f); setTimeout(f,0); return () => {}; }
    };
  }
  const db = {doc, collection};
  const user = {id: async () => role==='owner' ? 'u_owner' : 'u_staff1', isOwner: async () => role==='owner', canEdit: async () => role==='owner', name: async () => role};
  const sample = async (turns, opts) => { const t = 'Здравствуйте, я хочу сдать анализ крови.\nОценка: хорошо.'; if(opts&&opts.onText) opts.onText({text:t}); return {text: t}; };
  sample.json = async () => ({kind:'Договор', folder:'10', item:'j1', title:'Договор на электроснабжение', date:'2026-01-15', number:'12', party:'Наманган энерго', amount:150000, expiry:'2026-12-31', notes:'тест', sensitive:false, confidence:0.9, warnings:[]});
  sample.limits = async () => ({images: true});
  const downloads = {save: async (o) => { window.__DOWNLOADED = o.filename; }};
  const caps = {db, user, sample, downloads};
  window.claude = {use: async (name) => caps[name] || null};
})();
