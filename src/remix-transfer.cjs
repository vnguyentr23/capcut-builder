const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const remix=require('./remix.cjs'),channels=require('./channels.cjs'),media=require('./media.cjs');
const {uid}=require('./domain.cjs'),zlib=require('node:zlib');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const norm=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
async function exportPackage(store,id,file){
 const batch=remix.get(store,id),state=store.get(batch.channelId),resources=new Map();
 const cached=new Map(store.db.prepare('SELECT path,data FROM media').all().map(r=>[norm(r.path),JSON.parse(r.data)]));
 async function add(p){if(!p||resources.has(norm(p)))return;let m=cached.get(norm(p));if(fs.existsSync(p)&&!m){const st=fs.statSync(p);m={fingerprint:await media.hash(p),size:st.size};}resources.set(norm(p),{path:p,name:path.basename(p),fingerprint:m?.fingerprint||null,size:m?.size||null});}
 for(const src of batch.sources)for(const m of src.draft.materials?.videos||[])await add(m.path);
 for(const p of batch.projects){for(const m of p.draft.materials?.videos||[])await add(m.path);for(const a of p.assignments)await add(a.path);}
 const library=state.groups.map(g=>({name:g.name,folder:g.folder,items:g.items.map(id=>store.media(id)).filter(Boolean).map(m=>({name:m.name,path:m.path,fingerprint:m.fingerprint,size:m.size}))}));
 for(const g of library)for(const m of g.items)resources.set(norm(m.path),m);
 const histories=channels.list(store,state.id).map(c=>({name:c.name,origin:c.id===c.root_id,used:[...store.used(c.id)],reserved:[...store.blocked(c.id,'')]}));
 const body={id:batch.id,nicheName:state.name,channelName:state.channelName,batch,resources:[...resources.values()],library,histories,history:remix.allSignatures(store,batch.rootId)};
 const pkg={format:'ccb-remix',version:1,digest:digest(body),body};fs.writeFileSync(file,zlib.gzipSync(Buffer.from(JSON.stringify(pkg))));return {path:file,resources:resources.size,missing:[...resources.values()].filter(r=>!r.fingerprint).map(r=>r.path)};
}
function readPackage(file){if(fs.statSync(file).size>150*1024*1024)throw Error('Gói quá lớn (tối đa 150 MB).');const raw=fs.readFileSync(file),decoded=raw[0]===31&&raw[1]===139?zlib.gunzipSync(raw,{maxOutputLength:150*1024*1024}):raw;const p=JSON.parse(decoded.toString('utf8').replace(/^\uFEFF/,''),(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('Gói chứa khóa không hợp lệ.');return v;});if(p.format!=='ccb-remix'||p.version!==1||p.digest!==digest(p.body))throw Error('Gói không hợp lệ hoặc phiên bản chưa hỗ trợ.');if(!p.body?.batch||!Array.isArray(p.body.batch.sources)||!Array.isArray(p.body.batch.projects)||p.body.batch.projects.length>1000||p.body.batch.sources.length>1000||!p.body.batch.settings||typeof p.body.nicheName!=='string'||typeof p.body.channelName!=='string'||!Array.isArray(p.body.resources)||p.body.resources.length>100000)throw Error('Gói thiếu danh mục tài nguyên.');return p;}
async function matchResources(pkg,roots,onProgress=()=>{}){
 if(!roots?.length)throw Error('Chọn thư mục chứa footage / nhạc trên máy này.');
 const wanted=new Set(pkg.body.resources.filter(r=>r.size!==null).map(r=>r.size)),files=[];
 async function walk(folder){for(const d of await fs.promises.readdir(folder,{withFileTypes:true})){if(d.isSymbolicLink())continue;const f=path.join(folder,d.name);if(d.isDirectory())await walk(f);else if(d.isFile()){const st=await fs.promises.stat(f);if(wanted.has(st.size))files.push({path:f,size:st.size});}}}
 for(const folder of new Set(roots.map(r=>path.resolve(r))))await walk(folder);
 const wantedHash=new Set(pkg.body.resources.map(r=>r.fingerprint)),byHash=new Map(),errors=[];let done=0;
 for(const f of files){try{const fp=await media.hash(f.path);if(wantedHash.has(fp)){const list=byHash.get(fp)||[];list.push(f.path);byHash.set(fp,list);}}catch(e){errors.push({path:f.path,error:e.message});}onProgress({done:++done,total:files.length,file:path.basename(f.path)});}
 const mappings={},missing=[],duplicates=[];
 for(const r of pkg.body.resources){const found=byHash.get(r.fingerprint)||[];if(found.length){mappings[norm(r.path)]=found[0];if(found.length>1)duplicates.push({name:r.name,copies:found.length});}else missing.push({path:r.path,name:r.name,reason:r.fingerprint?'Chưa tìm thấy file cùng nội dung':'Nguồn chưa có dấu vân tay'});}
 return {mappings,missing,duplicates,errors};
}
function rewrite(value,mappings){if(Array.isArray(value))return value.map(v=>rewrite(v,mappings));if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value)){if(['path','file_Path','source_path'].includes(k)&&typeof v==='string'&&v)out[k]=mappings[norm(v)]||v;else out[k]=rewrite(v,mappings);}return out;}return value;}
async function importPackage(store,pkg,match){
 const key='remix-package:'+pkg.digest,previous=store.pref(key);if(previous&&store.db.prepare('SELECT id FROM remix_batches WHERE id=?').get(previous))return {batch:rebind(store,remix.get(store,previous),match),alreadyImported:true};
 let root=store.list().find(n=>n.name.toLocaleLowerCase()===pkg.body.nicheName.toLocaleLowerCase());if(!root)root=store.create(pkg.body.nicheName);
 let target=channels.list(store,root.id).find(c=>c.name===pkg.body.channelName);if(!target)target=channels.create(store,root.id,pkg.body.channelName);
 const b=rewrite(structuredClone(pkg.body.batch),match.mappings),originalId=b.id;b.id=uid();b.rootId=root.id;b.channelId=target.id;b.name=b.name+' · Nhập';b.originPackageId=originalId;b.inheritedHistory=[...new Set([...(b.inheritedHistory||[]),...(pkg.body.history||[])])];b.transferIssues=match.missing;
 for(const src of b.sources){const next={};for(const [old,fp] of Object.entries(src.fingerprints||{}))next[norm(match.mappings[norm(old)]||old)]=fp;src.fingerprints=next;}
 for(const p of b.projects){p.id=uid();p.installed=null;}
 b.settings.destination='';b.musicFolders={hook:'',body:''};b.assetManifest=pkg.body.resources;b.assetBindings=match.mappings;
 const state=store.get(target.id);
 for(const g of pkg.body.library||[]){const items=[];for(const item of g.items){const local=match.mappings[norm(item.path)];if(local){try{items.push((await media.inspect(local,store)).id);}catch{}}}if(items.length){const old=state.groups.find(x=>x.name===g.name);if(old)old.items=[...new Set([...old.items,...items])];else state.groups.push({id:uid(),name:g.name,folder:path.dirname(store.media(items[0]).path),items,pinned:[],excluded:[],lockedOnly:g.name==='HOOKS'});}}
 if(!state.draft.pattern.length)state.draft.pattern=state.groups.map(g=>g.id);
 store.db.exec('BEGIN IMMEDIATE');try{store.save(state);remix.save(store,b);
 for(const h of pkg.body.histories||[]){let c=channels.list(store,root.id).find(c=>h.origin?c.id===root.id:c.name===h.name);if(!c)c=channels.create(store,root.id,h.name);const historyId='transfer:'+pkg.body.id+':'+c.id;for(const fp of new Set([...(h.used||[]),...(h.reserved||[])]))store.db.prepare('INSERT OR IGNORE INTO reservations VALUES(?,?,?)').run(c.id,historyId,fp);for(const fp of h.used||[])store.db.prepare('INSERT OR IGNORE INTO usage VALUES(?,?,?,?)').run(c.id,fp,historyId,'body');}
 store.pref(key,b.id);store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');throw e;}
 return {batch:b,alreadyImported:false};
}
function rebind(store,b,match){
 const mappings={...match.mappings};for(const [old,current] of Object.entries(b.assetBindings||{}))if(match.mappings[old])mappings[norm(current)]=match.mappings[old];
 b=rewrite(b,mappings);for(const s of b.sources){s.fingerprints=Object.fromEntries(Object.entries(s.fingerprints||{}).map(([p,fp])=>[norm(mappings[norm(p)]||p),fp]));}
 b.transferIssues=match.missing;b.assetBindings={...b.assetBindings,...match.mappings};return remix.save(store,b);
}
async function relink(store,id,roots,progress){const b=remix.get(store,id);if(!b.assetManifest)throw Error('Bộ này chưa nhập từ gói chuyển máy.');const m=await matchResources({body:{resources:b.assetManifest}},roots,progress);return {batch:rebind(store,b,m),matched:Object.keys(m.mappings).length,missing:m.missing};}
module.exports={exportPackage,readPackage,matchResources,importPackage,rewrite,relink};
