'use strict';
const fs = require('fs');
const path = require('path');

// Shared database: one JSON file of {"collection/doc": value}. Writes are batched and atomic (tmp + rename).
class Store {
  constructor(file) {
    this.file = file;
    this.data = {};
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('Не удалось прочитать базу ' + file + ': ' + e.message);
    }
    this.version = Date.now();
    this.timer = null;
  }
  get(p) { const v = this.data[p]; return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  set(p, v) { this.data[p] = JSON.parse(JSON.stringify(v === undefined ? null : v)); this.changed(); }
  del(p) { delete this.data[p]; this.changed(); }
  // direct children of a collection, including ids that only have sub-collections (like Firestore parents)
  list(p) {
    const prefix = p + '/', depth = p.split('/').length + 1, ids = new Set();
    for (const k of Object.keys(this.data)) if (k.startsWith(prefix)) { const s = k.split('/'); if (s.length >= depth) ids.add(s[depth - 1]); }
    return [...ids].map(id => ({ id, data: this.get(prefix + id) }));
  }
  changed() {
    this.version++;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 300);
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
module.exports = { Store };
