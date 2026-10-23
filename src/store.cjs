const {DatabaseSync}=require('node:sqlite');
const {uid,defaults,migratePresets,fixName}=require('./domain.cjs');
class Store {
  constructor(file) {
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS niches(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,path TEXT NOT NULL,size REAL,mtime REAL,fingerprint TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS media_path ON media(path);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,niche_id TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,path TEXT,created_at TEXT NOT NULL,snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage(niche_id TEXT NOT NULL,fingerprint TEXT NOT NULL,project_id TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(niche_id,fingerprint,project_id,role));
      CREATE INDEX IF NOT EXISTS usage_niche ON usage(niche_id,fingerprint);
      CREATE TABLE IF NOT EXISTS reservations(niche_id TEXT NOT NULL,draft_id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(niche_id,draft_id,fingerprint));
      CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT); PRAGMA user_version=1;`);
    // Backfill existing manifests and archived drafts once; keep USED semantics separate.
    if(!this.pref('reservations-v1')){
      this.db.exec('BEGIN IMMEDIATE');
      try{for(const row of this.db.prepare('SELECT * FROM projects').all()){
        const snap=JSON.parse(row.snapshot);this.reserve(row.niche_id,snap.draft?.id||snap.projectId||row.id,snap);
      }this.pref('reservations-v1','1');this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
    }
  }
  reserve(niche,draftId,snapshot){
    const d=snapshot.draft, fingerprints=new Set((snapshot.clips||[]).filter(c=>['hook','body'].includes(c.role)).map(c=>c.fingerprint));
    for(const c of [...(d?.body||[]),...(d?.hook||[])])fingerprints.add(this.media(c.id)?.fingerprint);
    const insert=this.db.prepare('INSERT OR IGNORE INTO reservations VALUES(?,?,?)');
    for(const fp of fingerprints)if(fp)insert.run(niche,draftId,fp);
  }
  blocked(niche,draftId){return new Set(this.db.prepare('SELECT DISTINCT fingerprint FROM reservations WHERE niche_id=? AND draft_id<>?').all(niche,draftId).map(r=>r.fingerprint));}
  list(){return this.db.prepare('SELECT id,name FROM niches ORDER BY rowid').all();}
  deleteNiche(id){
    const state=this.get(id);this.db.exec('BEGIN IMMEDIATE');
    try{
      const snapshot={state,deletedAt:new Date().toISOString()};
      for(const table of ['projects','usage','reservations'])snapshot[table]=this.db.prepare('SELECT * FROM '+table+' WHERE niche_id=?').all(id);
      this.pref('deleted-niche:'+id,JSON.stringify(snapshot));
      for(const table of ['usage','reservations','projects'])this.db.prepare('DELETE FROM '+table+' WHERE niche_id=?').run(id);
      this.db.prepare('DELETE FROM niches WHERE id=?').run(id);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  nameDraft(s,exists=()=>false){
    const base=fixName(s.name).slice(0,85),rows=this.db.prepare('SELECT name,snapshot FROM projects WHERE niche_id=?').all(s.id);
    let number=Math.max(0,s.projectCounter||0);
    for(const row of rows){const snap=JSON.parse(row.snapshot);number=Math.max(number,snap.draft?.projectNumber||0);if(row.name.startsWith(base+'_')){const n=Number(row.name.slice(base.length+1));if(Number.isSafeInteger(n))number=Math.max(number,n);}}
    const names=new Set(rows.map(r=>r.name.toLocaleLowerCase()));let name;
    do{name=base+'_'+(++number);}while(names.has(name.toLocaleLowerCase())||exists(name));
    s.projectCounter=number;s.draft.projectNumber=number;s.draft.autoName=true;s.draft.name=name;return name;
  }
  create(name){const state={id:uid(),name,parent:'',groups:[],draft:defaults()};this.nameDraft(state);this.save(state);return state;}
  get(id){const row=this.db.prepare('SELECT state FROM niches WHERE id=?').get(id);if(!row)throw Error('Không tìm thấy ngách.');const s=JSON.parse(row.state);if(/^Dự án mới(?:[ (].*)?$/.test(s.draft.name)){this.nameDraft(s);this.save(s);}if(s.draft.musicVersion!==3||!s.draft.writerVersion||!(s.draft.presetVersion>=3)||!s.draft.blockVersion||!s.draft.shortClipFill||!s.draft.ducking){migratePresets(s.draft);this.save(s);}return s;}
  save(s){migratePresets(s.draft);this.db.prepare('INSERT INTO niches VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,state=excluded.state').run(s.id,s.name,JSON.stringify(s));}
  cached(file,size,mtime){const row=this.db.prepare('SELECT data FROM media WHERE path=? AND size=? AND mtime=? ORDER BY rowid DESC LIMIT 1').get(file,size,mtime);return row?JSON.parse(row.data):null;}
  putMedia(m){this.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,mtime=excluded.mtime').run(m.id,m.path,m.size,m.mtime,m.fingerprint,JSON.stringify(m));}
  media(id){const r=this.db.prepare('SELECT data FROM media WHERE id=?').get(id);return r?JSON.parse(r.data):null;}
  hydrate(s){const result=new Map();for(const id of new Set([...s.groups.flatMap(g=>g.items),...s.draft.hook.map(h=>h.id),...s.draft.body.map(h=>h.id)])){const m=this.media(id);if(m){const manual=Object.hasOwn(s.sources||{},id),fallback=!(m.source||'').trim();result.set(id,{...m,source:manual?s.sources[id]:fallback?require('node:path').win32.parse(m.path).name.replace(/(?:\s*\(\d+\))+\s*$/u,'').trimEnd():m.source,sourceOrigin:manual?'manual':fallback?'filename':'source'});}}return result;}
  used(niche){return new Set(this.db.prepare('SELECT DISTINCT fingerprint FROM usage WHERE niche_id=?').all(niche).map(r=>r.fingerprint));}
  history(niche){return this.db.prepare('SELECT id,name,status,path,created_at FROM projects WHERE niche_id=? ORDER BY created_at DESC').all(niche);}
  archiveDraft(s){this.reserve(s.id,s.draft.id,{draft:s.draft});if(s.draft.body.length||s.draft.hook.length)this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(uid(),s.id,s.draft.name,'DRAFT','',new Date().toISOString(),JSON.stringify({draft:s.draft,sources:s.sources||{}}));}
  record(s,file,m,adapterResult){
    const real=adapterResult?.compatible===true&&adapterResult?.verified===true;
    if(real&&adapterResult.kind!=='capcut')throw Error('Adapter không hợp lệ.');
    const id=uid();this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(id,s.id,s.draft.name,real?'CREATED':'MANIFEST',file,new Date().toISOString(),JSON.stringify(m));
      this.reserve(s.id,s.draft.id,m);
      if(real) for(const c of m.clips.filter(c=>['hook','body'].includes(c.role))) this.db.prepare('INSERT OR IGNORE INTO usage VALUES(?,?,?,?)').run(s.id,c.fingerprint,id,c.role);
      this.db.exec('COMMIT');
    } catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  pref(key,value){if(value!==undefined)this.db.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);return this.db.prepare('SELECT value FROM preferences WHERE key=?').get(key)?.value;}
  close(){this.db.close();}
}
module.exports={Store};
