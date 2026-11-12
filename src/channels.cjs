const {uid,defaults,fixName}=require('./domain.cjs');
function schema(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,root_id TEXT NOT NULL,name TEXT NOT NULL);
 `);
 if(!store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='remix_projects'").get()){store.db.exec(`CREATE TABLE IF NOT EXISTS remix_batches(id TEXT PRIMARY KEY,root_id TEXT NOT NULL,channel_id TEXT NOT NULL,name TEXT NOT NULL,data TEXT NOT NULL,updated TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '{}');`);
 if(!store.db.prepare('PRAGMA table_info(remix_batches)').all().some(c=>c.name==='summary'))store.db.exec("ALTER TABLE remix_batches ADD COLUMN summary TEXT NOT NULL DEFAULT '{}'");
 store.db.exec("CREATE INDEX IF NOT EXISTS remix_root_updated ON remix_batches(root_id,updated DESC); CREATE INDEX IF NOT EXISTS remix_identity_updated ON remix_batches(id,updated); CREATE INDEX IF NOT EXISTS remix_channel ON remix_batches(channel_id); CREATE INDEX IF NOT EXISTS remix_summary_migration ON remix_batches(id) WHERE summary='{}'; CREATE INDEX IF NOT EXISTS channels_root ON channels(root_id)");
 for(const row of store.db.prepare("SELECT id,data FROM remix_batches WHERE summary='{}'").all()){const b=JSON.parse(row.data);store.db.prepare('UPDATE remix_batches SET summary=? WHERE id=?').run(JSON.stringify({count:b.projects.length,sourceCount:b.sources.length,created:b.projects.filter(p=>p.installed).length,names:b.projects.map(p=>p.name),signatures:[...(b.inheritedHistory||[]),...b.projects.map(p=>p.signature)]}),row.id);}
 require('./remix-storage.cjs').install(store.db);}
 for(const row of store.db.prepare('SELECT id FROM niches').all())if(!store.db.prepare('SELECT id FROM channels WHERE id=?').get(row.id))store.db.prepare('INSERT INTO channels VALUES(?,?,?)').run(row.id,row.id,'Kênh gốc');
}
function list(store,id){const c=store.db.prepare('SELECT * FROM channels WHERE id=?').get(id);return store.db.prepare('SELECT * FROM channels WHERE root_id=? ORDER BY rowid').all(c?.root_id||id);}
// The header lists channel names across niches. Only materialize a workspace on selection.
function headerList(store,id){
 const local=list(store,id),seen=new Set(local.map(c=>c.name.toLocaleLowerCase()));
 const options=[...local];
 for(const {name} of store.db.prepare('SELECT DISTINCT name FROM channels WHERE id<>root_id ORDER BY name').all()){
  const key=name.toLocaleLowerCase();
  if(!seen.has(key)){seen.add(key);options.push({id:'shared:'+name,name});}
 }
 return options;
}
function select(store,current,choice){
 const local=list(store,current);
 const existing=local.find(c=>c.id===choice);
 if(existing)return store.get(existing.id);
 if(!choice.startsWith('shared:'))throw Error('Kênh không thuộc ngách đang chọn.');
 const name=choice.slice(7),key=name.toLocaleLowerCase();
 const workspace=local.find(c=>c.name.toLocaleLowerCase()===key);
 if(workspace)return store.get(workspace.id);
 if(!headerList(store,current).some(c=>c.id===choice))throw Error('Không tìm thấy kênh.');
 return create(store,local.find(c=>c.id===c.root_id).id,name);
}
function decorate(store,s){
 const c=store.db.prepare('SELECT * FROM channels WHERE id=?').get(s.id);if(!c)return s;
 s.rootNicheId=c.root_id;s.channelName=c.name;
 if(c.root_id!==s.id){const root=JSON.parse(store.db.prepare('SELECT state FROM niches WHERE id=?').get(c.root_id).state);const local=new Map(s.groups.map(g=>[g.id,g]));s.name=root.name;s.parent=root.parent;s.draft.pattern=[...root.draft.pattern];s.groups=root.groups.map(g=>({...g,pinned:local.get(g.id)?.pinned||[]}));s.sources={...root.sources,...s.sources};}
 return s;
}
function syncLibrary(store,s){
 const c=store.db.prepare('SELECT * FROM channels WHERE id=?').get(s.id);
 if(!c){store.db.prepare('INSERT INTO channels VALUES(?,?,?)').run(s.id,s.id,'Kênh gốc');return;}
 if(c.root_id!==s.id){const row=store.db.prepare('SELECT state FROM niches WHERE id=?').get(c.root_id);const root=JSON.parse(row.state),pins=new Map(root.groups.map(g=>[g.id,g.pinned]));root.name=s.name;root.parent=s.parent;root.draft.pattern=[...s.draft.pattern];root.groups=s.groups.map(g=>({...g,pinned:pins.get(g.id)||[]}));root.sources={...root.sources,...s.sources};store.db.prepare('UPDATE niches SET state=?,name=? WHERE id=?').run(JSON.stringify(root),root.name,root.id);}
}
function create(store,id,name){
 name=String(name||'').trim();if(!name||fixName(name)!==name)throw Error('Tên kênh không hợp lệ.');
 const from=store.get(id),root=from.rootNicheId||from.id;
 if(list(store,id).some(c=>c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Tên kênh đã tồn tại.');
 const s=structuredClone(from);s.id=uid();s.rootNicheId=root;s.channelName=name;s.projectCounter=1;
 s.draft={...s.draft,id:uid(),name:name+'_1',projectNumber:1,hook:[],body:[],end:null,assignments:{},excluded:[],pinOrder:[]};
 for(const g of s.groups)g.pinned=[];
 delete s.importSource;
 const nested=store.db.isTransaction;if(!nested)store.db.exec('BEGIN IMMEDIATE');try{store.db.prepare('INSERT INTO channels VALUES(?,?,?)').run(s.id,root,name);store.nameDraft(s);store.save(s);if(!nested)store.db.exec('COMMIT');}catch(e){if(!nested)store.db.exec('ROLLBACK');throw e;}return s;
}
function rename(store,id,name){
 name=String(name||'').trim();
 if(!name||fixName(name)!==name)throw Error('Tên kênh không hợp lệ.');
 const current=store.db.prepare('SELECT * FROM channels WHERE id=?').get(id);
 if(!current)throw Error('Không tìm thấy kênh.');
 if(current.id===current.root_id)throw Error('Kênh gốc là mục mặc định.');
 const rows=store.db.prepare('SELECT * FROM channels').all();
 const oldKey=current.name.toLocaleLowerCase(),newKey=name.toLocaleLowerCase();
 if(rows.some(c=>c.name.toLocaleLowerCase()===newKey&&c.name.toLocaleLowerCase()!==oldKey))throw Error('Tên kênh đã tồn tại.');
 const scope=rows.filter(c=>c.id!==c.root_id&&c.name.toLocaleLowerCase()===oldKey);
 store.db.exec('BEGIN IMMEDIATE');
 try{
  const update=store.db.prepare('UPDATE channels SET name=? WHERE id=?');
  for(const channel of scope)update.run(name,channel.id);
  store.db.exec('COMMIT');
 }catch(error){store.db.exec('ROLLBACK');throw error;}
 return store.get(id);
}
function removalScope(store,id){
 const c=store.db.prepare('SELECT * FROM channels WHERE id=?').get(id);if(!c)throw Error('Không tìm thấy kênh.');if(c.id===c.root_id)throw Error('Không được xóa Kênh gốc.');
 return store.db.prepare('SELECT c.*,n.name AS niche FROM channels c JOIN niches n ON n.id=c.root_id WHERE c.id<>c.root_id ORDER BY n.name').all().filter(row=>row.name.toLocaleLowerCase()===c.name.toLocaleLowerCase());
}
function remove(store,selectedId){
 store.db.exec('BEGIN IMMEDIATE');try{
 const scope=removalScope(store,selectedId),root=scope.find(c=>c.id===selectedId).root_id;
 for(const c of scope){
 const id=c.id;
 const snapshot={channel:c,deletedAt:new Date().toISOString(),workspace:store.db.prepare('SELECT * FROM niches WHERE id=?').get(id),batches:store.db.prepare('SELECT * FROM remix_batches WHERE channel_id=?').all(id)};
 for(const table of ['projects','usage','reservations'])snapshot[table]=store.db.prepare('SELECT * FROM '+table+' WHERE niche_id=?').all(id);
 store.pref('deleted-channel:'+id,JSON.stringify(snapshot));
 for(const table of ['projects','usage','reservations'])store.db.prepare('DELETE FROM '+table+' WHERE niche_id=?').run(id);
 store.db.prepare('DELETE FROM remix_batches WHERE channel_id=?').run(id);store.db.prepare('DELETE FROM niches WHERE id=?').run(id);store.db.prepare('DELETE FROM channels WHERE id=?').run(id);
 if(store.pref('channel-active:'+c.root_id)===id||id===selectedId)store.pref('channel-active:'+c.root_id,c.root_id);
 }
 store.pref('active',root);store.db.exec('COMMIT');return root;
 }catch(e){store.db.exec('ROLLBACK');throw e;}
}
module.exports={schema,list,headerList,select,decorate,syncLibrary,create,rename,removalScope,remove};
