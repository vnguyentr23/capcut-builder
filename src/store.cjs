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
      CREATE INDEX IF NOT EXISTS projects_niche_created ON projects(niche_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS usage(niche_id TEXT NOT NULL,fingerprint TEXT NOT NULL,project_id TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(niche_id,fingerprint,project_id,role));
      CREATE INDEX IF NOT EXISTS usage_niche ON usage(niche_id,fingerprint);
      CREATE TABLE IF NOT EXISTS reservations(niche_id TEXT NOT NULL,draft_id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(niche_id,draft_id,fingerprint));
      CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT); PRAGMA user_version=1;`);
    if(file!==':memory:'&&!this.db.prepare("SELECT name FROM sqlite_master WHERE name='channels'").get()&&this.db.prepare('SELECT COUNT(*) AS n FROM niches').get().n){const backup=file+'.before-channels-'+Date.now()+'.sqlite';this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");}
    if(file!==':memory:'&&this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='remix_batches'").get()&&this.db.prepare('SELECT 1 FROM remix_batches LIMIT 1').get()){
      const backup=file+'.before-remix-projects-'+Date.now()+'.sqlite';
      this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    require('./channels.cjs').schema(this);
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
  blocked(niche,draftId){return new Set(this.db.prepare("SELECT fingerprint FROM reservations WHERE niche_id=? AND draft_id<>? UNION SELECT u.fingerprint FROM usage u LEFT JOIN projects p ON p.id=u.project_id WHERE u.niche_id=? AND (p.id IS NULL OR COALESCE(json_extract(p.snapshot,'$.draft.id'),json_extract(p.snapshot,'$.projectId'),'')<>?)").all(niche,draftId,niche,draftId).map(r=>r.fingerprint));}
  list(){return this.db.prepare('SELECT id,name FROM niches WHERE id IN (SELECT root_id FROM channels) ORDER BY rowid').all();}
  deleteNiche(id){
    const state=this.get(id);id=state.rootNicheId||id;const scopes=require('./channels.cjs').list(this,id).map(c=>c.id);this.db.exec('BEGIN IMMEDIATE');
    try{
      const snapshot={state,deletedAt:new Date().toISOString()};
      for(const table of ['projects','usage','reservations'])snapshot[table]=scopes.flatMap(scope=>this.db.prepare('SELECT * FROM '+table+' WHERE niche_id=?').all(scope));
      snapshot.channels=require('./channels.cjs').list(this,id);snapshot.workspaces=scopes.map(scope=>this.db.prepare('SELECT * FROM niches WHERE id=?').get(scope));snapshot.batches=this.db.prepare('SELECT * FROM remix_batches WHERE root_id=?').all(id);this.pref('deleted-niche:'+id,JSON.stringify(snapshot));
      for(const table of ['usage','reservations','projects'])for(const scope of scopes)this.db.prepare('DELETE FROM '+table+' WHERE niche_id=?').run(scope);
      for(const scope of scopes)this.db.prepare('DELETE FROM niches WHERE id=?').run(scope);this.db.prepare('DELETE FROM channels WHERE root_id=?').run(id);this.db.prepare('DELETE FROM remix_batches WHERE root_id=?').run(id);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  canNewDraft(s){return !!this.db.prepare("SELECT 1 FROM projects WHERE niche_id=? AND status='CREATED' AND (json_extract(snapshot,'$.draft.id')=? OR json_extract(snapshot,'$.projectId')=?) LIMIT 1").get(s.id,s.draft.id,s.draft.id);}
  requireCreatedDraft(s){if(!this.canNewDraft(s))throw Error('Hãy tạo dự án CapCut thành công trước khi tạo dự án mới.');}
  projectNameBase(s){
    const channel=this.db.prepare('SELECT name FROM channels WHERE id=?').get(s.id)?.name||s.channelName||'Kênh gốc';
    return fixName(channel+'_'+s.name).slice(0,85);
  }
  projectNameSequence(s, draftId=null, exists=()=>false){
    const base=this.projectNameBase(s);
    const keys=new Set(),names=new Set();
    for(const row of this.db.prepare('SELECT name,snapshot FROM projects WHERE niche_id=?').all(s.id)){
      const snap=JSON.parse(row.snapshot),id=snap.draft?.id||snap.projectId;
      if(draftId&&id===draftId)continue;
      keys.add(id||row.name.trim().replace(/[_\s]+/g,' ').toLocaleLowerCase());
      names.add(row.name.toLocaleLowerCase());
    }
    for(const row of this.db.prepare('SELECT summary FROM remix_batches WHERE channel_id=?').all(s.id))
      for(const name of JSON.parse(row.summary).names||[])names.add(name.toLocaleLowerCase());
    let number=keys.size;
    return ()=>{
      let name;
      do{name=base+'_'+(++number);}while(names.has(name.toLocaleLowerCase())||exists(name));
      return {number,name};
    };
  }
  nameDraft(s,exists=()=>false){
    const {number,name}=this.projectNameSequence(s,s.draft.id,exists)();
    s.projectCounter=number;s.draft.projectNumber=number;s.draft.autoName=true;s.draft.nameLocked=true;s.draft.name=name;return name;
  }
  draftSnapshot(s,revision){return {draft:structuredClone(s.draft),sources:s.sources||{},libraryState:s.groups.map(g=>({id:g.id,items:g.items,pinned:g.pinned,order:g.order,sort:g.sort})),...(revision===undefined?{}:{bodyRevision:revision})};}
  saveWorking(s){
    const id='working:'+s.id+':'+s.draft.id;
    if(!this.db.prepare("SELECT 1 FROM projects WHERE niche_id=? AND json_extract(snapshot,'$.draft.id')=? LIMIT 1").get(s.id,s.draft.id))return;
    this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,created_at=excluded.created_at,snapshot=excluded.snapshot').run(id,s.id,s.draft.name,'WORKING','',new Date().toISOString(),JSON.stringify(this.draftSnapshot(s)));
  }
  bodyMilestone(s){
    const row=this.db.prepare("SELECT MAX(CAST(json_extract(snapshot,'$.bodyRevision') AS INTEGER)) AS n FROM projects WHERE niche_id=? AND json_extract(snapshot,'$.draft.id')=? AND status='BODY_REVISION'").get(s.id,s.draft.id),revision=row.n===null?0:row.n+1;
    this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(uid(),s.id,s.draft.name,'BODY_REVISION','',new Date().toISOString(),JSON.stringify(this.draftSnapshot(s,revision)));this.save(s);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  create(name){const state={id:uid(),name,parent:'',groups:[],draft:defaults()};this.nameDraft(state);this.save(state);return state;}
  get(id){const row=this.db.prepare('SELECT state FROM niches WHERE id=?').get(id);if(!row)throw Error('Không tìm thấy ngách.');const s=JSON.parse(row.state);if(!s.draft.nameLocked){if(!this.canNewDraft(s))this.nameDraft(s);s.draft.nameLocked=true;this.save(s);}if(/^Dự án mới(?:[ (].*)?$/.test(s.draft.name)){this.nameDraft(s);this.save(s);}if(s.draft.musicVersion!==3||!s.draft.writerVersion||!(s.draft.presetVersion>=3)||!s.draft.blockVersion||!s.draft.shortClipFill||!s.draft.ducking){migratePresets(s.draft);this.save(s);}return require('./channels.cjs').decorate(this,s);}
  save(s){const previous=this.db.prepare('SELECT state FROM niches WHERE id=?').get(s.id);if(previous){const old=JSON.parse(previous.state);if(old.draft.id===s.draft.id&&old.draft.nameLocked){s.draft.name=old.draft.name;s.draft.projectNumber=old.draft.projectNumber;s.draft.nameLocked=true;}}migratePresets(s.draft);require('./channels.cjs').syncLibrary(this,s);this.db.prepare('INSERT INTO niches VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,state=excluded.state').run(s.id,s.name,JSON.stringify(s));this.saveWorking(s);}
  cached(file,size,mtime){const row=this.db.prepare('SELECT data FROM media WHERE path=? AND size=? AND mtime=? ORDER BY rowid DESC LIMIT 1').get(file,size,mtime);return row?JSON.parse(row.data):null;}
  putMedia(m){this.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,mtime=excluded.mtime').run(m.id,m.path,m.size,m.mtime,m.fingerprint,JSON.stringify(m));}
  media(id){const r=this.db.prepare('SELECT data FROM media WHERE id=?').get(id);return r?JSON.parse(r.data):null;}
  hydrate(s){const result=new Map(),query=this.db.prepare('SELECT data FROM media WHERE id=?');for(const id of new Set([...s.groups.flatMap(g=>g.items),...s.draft.hook.map(h=>h.id),...s.draft.body.map(h=>h.id)])){const row=query.get(id),m=row?JSON.parse(row.data):null;if(m){const manual=Object.hasOwn(s.sources||{},id),fallback=!(m.source||'').trim();result.set(id,{...m,source:manual?s.sources[id]:fallback?require('node:path').win32.parse(m.path).name.replace(/(?:\s*\(\d+\))+\s*$/u,'').trimEnd():m.source,sourceOrigin:manual?'manual':fallback?'filename':'source'});}}return result;}
  used(niche){return new Set(this.db.prepare('SELECT DISTINCT fingerprint FROM usage WHERE niche_id=?').all(niche).map(r=>r.fingerprint));}
  history(niche){return this.db.prepare("SELECT id,name,status,path,created_at,json_extract(snapshot,'$.draft.id') AS draft_id,json_extract(snapshot,'$.bodyRevision') AS body_revision FROM projects WHERE niche_id=? ORDER BY created_at DESC").all(niche);}
  archiveDraft(s){this.reserve(s.id,s.draft.id,{draft:s.draft});if(s.draft.body.length||s.draft.hook.length){const id='working:'+s.id+':'+s.draft.id;this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,created_at=excluded.created_at,snapshot=excluded.snapshot').run(id,s.id,s.draft.name,'WORKING','',new Date().toISOString(),JSON.stringify(this.draftSnapshot(s)));}}
  record(s,file,m,adapterResult){
    const real=adapterResult?.compatible===true&&adapterResult?.verified===true;
    if(real&&adapterResult.kind!=='capcut')throw Error('Adapter không hợp lệ.');
    const id=uid();this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(id,s.id,s.draft.name,real?'CREATED':'MANIFEST',file,new Date().toISOString(),JSON.stringify({...m,...(real&&adapterResult.timelineSnapshot?{timelineSnapshot:adapterResult.timelineSnapshot}:{})}));
      this.reserve(s.id,s.draft.id,m);
      if(real) for(const c of m.clips.filter(c=>['hook','body'].includes(c.role))) this.db.prepare('INSERT OR IGNORE INTO usage VALUES(?,?,?,?)').run(s.id,c.fingerprint,id,c.role);
      this.db.exec('COMMIT');
    } catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  pref(key,value){if(value!==undefined)this.db.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);return this.db.prepare('SELECT value FROM preferences WHERE key=?').get(key)?.value;}
  close(){this.db.close();}
}
module.exports={Store};
