// Persistent remix batches. Source drafts are immutable snapshots, never edited in place.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {uid,defaults,nameErrors}=require('./domain.cjs'),channels=require('./channels.cjs');
const norm=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const engine=()=>import(pathToFileURL(path.join(__dirname,'remix/engine.mjs')).href);
function list(store,id){const root=store.get(id).rootNicheId||id;return store.db.prepare('SELECT id,name,channel_id,updated,summary FROM remix_batches WHERE root_id=? ORDER BY updated DESC').all(root).map(r=>{const m=JSON.parse(r.summary);return {id:r.id,name:r.name,channelId:r.channel_id,count:m.count,sourceCount:m.sourceCount,created:m.created,updated:r.updated};});}
function get(store,id){const r=store.db.prepare('SELECT data FROM remix_batches WHERE id=?').get(id);if(!r)throw Error('Không tìm thấy bộ dự án.');return JSON.parse(r.data);}
function save(store,b){b.updated=new Date().toISOString();const summary={count:b.projects.length,sourceCount:b.sources.length,created:b.projects.filter(p=>p.installed).length,names:b.projects.map(p=>p.name),signatures:[...new Set([...(b.inheritedHistory||[]),...b.projects.map(p=>p.signature)])]};store.db.prepare('INSERT INTO remix_batches(id,root_id,channel_id,name,data,updated,summary) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated,name=excluded.name,summary=excluded.summary').run(b.id,b.rootId,b.channelId,b.name,JSON.stringify(b),b.updated,JSON.stringify(summary));return b;}
function present(b){return {...b,sources:b.sources.map(s=>({id:s.id,name:s.name})),projects:b.projects.map(p=>({id:p.id,name:p.name,locked:p.locked,installed:p.installed,editedAt:p.editedAt,sourceName:p.sourceName,signature:p.signature,reusedPercent:p.reusedPercent,blocks:p.blocks,assignments:p.assignments,draft:{duration:p.draft.duration}})),assetManifest:!!b.assetManifest};}
function sourceProjects(store,id){const root=store.get(id).rootNicheId||id;return channels.list(store,root).flatMap(c=>store.history(c.id).filter(p=>['IMPORTED','CREATED','REMIX_CREATED'].includes(p.status)).map(p=>({...p,channel:c.name}))).sort((a,b)=>a.channel.localeCompare(b.channel)||a.name.localeCompare(b.name,undefined,{numeric:true}));}
function signature(blocks){return hash(blocks.slice(1).flatMap(b=>b.units.map(u=>u.identity)));}
async function analyzeSources(sources,options={}){
 const e=await engine();for(const src of sources){src.fingerprints??={};for(const m of src.draft.materials?.videos||[])if(m.path&&!src.fingerprints[norm(m.path)]&&fs.existsSync(m.path))src.fingerprints[norm(m.path)]=await require('./media.cjs').hash(m.path);}
 return sources.map(src=>{
  const a=e.analyze(structuredClone(src.draft),src.name,src.id,src.path);a.meta=src.meta;
  // A terminal image is an ending, never a randomly distributed body slot.
  const last=a.blocks.at(-1),tail=last?.units.at(-1);
  if(tail&&/\.(png|jpe?g|webp|bmp)$/i.test(tail.path)){a.ending=last.units.pop();if(!last.units.length)a.blocks.pop();}
  for(const [i,b] of a.blocks.entries()){b.hook=i===0;for(const [slot,u] of b.units.entries()){u.slot=slot;u.blockId=b.id;u.hook=i===0;u.identity=src.fingerprints?.[norm(u.path)]||u.identity;}}
  a.signature=signature(a.blocks);return a;
 });
}
function seeded(seed){let n=parseInt(hash(seed).slice(0,8),16);return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function mix(sources,options,seed,known=[]){
 if(sources.length<2)throw Error('Chọn ít nhất hai dự án nguồn để trộn.');
 const invalid=sources.filter(s=>s.issues.length);if(invalid.length)throw Error(invalid.map(s=>s.name+': '+s.issues.join(' ')).join('\n'));
 const old=new Set([...sources.map(s=>s.signature),...known]);
 const danger=u=>false&&/\/b - nguy hiểm\//i.test(u.path.replaceAll('\\','/'));
 const unique=p=>{const ids=p.blocks.flatMap(b=>b.units.map(u=>u.identity));return new Set(ids).size===ids.length;};
 for(let attempt=0;attempt<160;attempt++){
  const random=seeded(seed+':'+attempt),plans=sources.map(source=>({source,blocks:source.blocks.map(b=>({...b,units:[...b.units]}))}));
  const originalIndex=new Map(sources.flatMap(s=>s.blocks.flatMap((b,i)=>b.units.map(u=>[u.id,i]))));
  const cells=plans.flatMap(p=>p.blocks.flatMap((b,i)=>b.units.map((u,slot)=>({p,b,i,slot}))));
  const valid=(a,b)=>a.slot===b.slot&&a.p!==b.p&&((a.i===0&&b.i===0&&options.mixHook)||(a.i>0&&b.i>0&&Math.abs(originalIndex.get(a.b.units[a.slot].id)-b.i)<=1&&Math.abs(originalIndex.get(b.b.units[b.slot].id)-a.i)<=1));
  const penalty=p=>{const ids=p.blocks.flatMap(b=>b.units.map(u=>u.identity));return ids.length-new Set(ids).size+p.blocks.reduce((n,b)=>n+Math.max(0,b.units.filter(danger).length-2),0);};
  // Swap same-position footage; repair existing collisions while preserving source block distance.
  for(let step=0;step<cells.length*30;step++){
   const a=cells[Math.floor(random()*cells.length)],b=cells[Math.floor(random()*cells.length)];if(!valid(a,b))continue;
   const before=penalty(a.p)+penalty(b.p);[a.b.units[a.slot],b.b.units[b.slot]]=[b.b.units[b.slot],a.b.units[a.slot]];
   if(penalty(a.p)+penalty(b.p)>before)[a.b.units[a.slot],b.b.units[b.slot]]=[b.b.units[b.slot],a.b.units[a.slot]];
  }
  if(plans.some(p=>!unique(p)||penalty(p)))continue;
  // Move a trailing block only when every moved footage remains within one original block.
  if(options.balance)for(let step=0;step<200;step++){
   const ranked=[...plans].sort((a,b)=>b.blocks.length-a.blocks.length);let moved=false;
   for(const donor of ranked)for(const receiver of [...ranked].reverse())if(!moved&&donor.blocks.length-receiver.blocks.length>=2){const b=donor.blocks.at(-1),at=receiver.blocks.length;if(b.units.some(u=>Math.abs(originalIndex.get(u.id)-at)>1))continue;donor.blocks.pop();receiver.blocks.push(b);if(unique(receiver)){moved=true;}else{receiver.blocks.pop();donor.blocks.push(b);}}
   if(!moved)break;
  }
  const sigs=plans.map(p=>signature(p.blocks));if(new Set(sigs).size!==sigs.length||sigs.some(s=>old.has(s)))continue;
  plans.forEach((p,i)=>p.signature=sigs[i]);return plans;
 }
 throw Error('Chưa tìm được tổ hợp thỏa không trùng footage và giữ vị trí block. Thử chọn thêm nguồn hoặc tắt giới hạn footage nguy hiểm.');
}
async function capture(store,ids){
 const cached=new Map(store.db.prepare('SELECT path,fingerprint FROM media').all().map(r=>[norm(r.path),r.fingerprint]));
 return Promise.all(ids.map(async id=>{const row=store.db.prepare('SELECT * FROM projects WHERE id=?').get(id);if(!row)throw Error('Dự án nguồn không còn tồn tại.');let folder=row.path,file=path.join(folder,'draft_content.json');const tp=path.join(folder,'Timelines/project.json');if(fs.existsSync(tp)){const p=read(tp);file=path.join(folder,'Timelines',p.main_timeline_id,'draft_content.json');}if(!fs.existsSync(file))throw Error('Không tìm thấy timeline: '+row.name);const draft=read(file);for(const m of draft.materials.videos||[]){if(m.path&&!cached.has(norm(m.path))&&fs.existsSync(m.path))cached.set(norm(m.path),await require('./media.cjs').hash(m.path));}return {id:row.id,name:row.name,path:folder,draft,meta:read(path.join(folder,'draft_meta_info.json')),fingerprints:Object.fromEntries((draft.materials.videos||[]).filter(m=>m.path).map(m=>[norm(m.path),cached.get(norm(m.path))||null]))};}));
}
function allSignatures(store,root){return [...new Set(store.db.prepare('SELECT summary FROM remix_batches WHERE root_id=?').all(root).flatMap(r=>JSON.parse(r.summary).signatures||[]))];}
function preferences(store,id){try{return JSON.parse(store.pref('remix-settings:'+id)||'{}');}catch{return {};}}
function sourcesFromBatch(b){if(!b.projects.length)return structuredClone(b.sources);const fingerprints=Object.assign({},...b.sources.map(s=>s.fingerprints||{}));return b.projects.map(p=>({id:p.id,name:p.name,path:p.installed||'',draft:structuredClone(p.draft),meta:{},fingerprints:{...fingerprints,...Object.fromEntries(p.blocks.flatMap(b=>b.clips).map(c=>[norm(c.path),c.fingerprint]))}}));}
async function saveSource(store,{stateId,sourceIds,name}){
 const state=store.get(stateId),allowed=new Set(sourceProjects(store,stateId).map(p=>p.id));if(!sourceIds?.length||sourceIds.some(id=>!allowed.has(id)))throw Error('Chọn dự án nguồn thuộc ngách.');
 const b={id:uid(),kind:'source',rootId:state.rootNicheId||stateId,channelId:stateId,name:name||'Bộ nguồn',sources:await capture(store,sourceIds),projects:[],settings:structuredClone(state.draft),options:{mixHook:true,balance:true,},inheritedHistory:allSignatures(store,state.rootNicheId||stateId)};
 const analyzed=await analyzeSources(b.sources,b.options);b.sourceSummary=analyzed.map(s=>({name:s.name,blocks:s.blocks.length,hook:s.blocks[0]?.units.length||0,issues:s.issues}));return save(store,b);
}
async function create(store,{stateId,sourceIds,channelId,name,sourceBatchId,options={}}){
 const state=store.get(stateId),root=state.rootNicheId||stateId,target=channels.list(store,root).find(c=>c.id===channelId);
 if(!target)throw Error('Chọn kênh đích thuộc ngách này.');
 const allowed=new Set(sourceProjects(store,stateId).map(p=>p.id));if(!sourceBatchId&&(!sourceIds?.length||sourceIds.some(id=>!allowed.has(id))))throw Error('Nguồn không thuộc ngách đang chọn.');
 const parent=sourceBatchId?get(store,sourceBatchId):null;if(parent&&parent.rootId!==root)throw Error('Bộ nguồn không thuộc ngách.');const sources=parent?sourcesFromBatch(parent):await capture(store,sourceIds),batch={id:uid(),rootId:root,channelId,name:String(name||'Bộ nhân bản').trim(),sources,projects:[],options:{mixHook:true,balance:true,...options},settings:structuredClone(store.get(channelId).draft),musicFolders:preferences(store,channelId).folders||{},inheritedHistory:allSignatures(store,root)};
 await generate(store,batch,target.name==='Kênh gốc'?state.name:target.name);store.pref('remix-settings:'+channelId,JSON.stringify({...preferences(store,channelId),options:batch.options}));return save(store,batch);
}
async function generate(store,batch,prefix,onlyId=null){
 const sources=await analyzeSources(batch.sources,batch.options),plans=mix(sources,batch.options,uid(),[...allSignatures(store,batch.rootId),...(batch.inheritedHistory||[])]),e=await engine();
 const otherNames=store.db.prepare('SELECT summary FROM remix_batches WHERE channel_id=?').all(batch.channelId).flatMap(r=>(JSON.parse(r.summary).names||[]).map(n=>n.toLowerCase()));
 const taken=new Set([...otherNames,...store.history(batch.channelId).map(p=>p.name.toLowerCase()),...batch.projects.map(p=>p.name.toLowerCase())]);let num=0;
 for(const [i,p] of plans.entries()){
  const previous=batch.projects[i];if(previous&&(previous.locked||previous.installed||(onlyId&&previous.id!==onlyId)))continue;
  let name=previous?.name;if(!name){do{name=prefix+'_'+(++num);}while(taken.has(name.toLowerCase()));taken.add(name.toLowerCase());}
  const result=e.buildDraft(p,sources,{name}),bodyOriginal=new Set(p.source.blocks.slice(1).flatMap(b=>b.units.map(u=>u.identity))),body=p.blocks.slice(1).flatMap(b=>b.units);
  const blocks=p.blocks.map((b,index)=>{const entries=result.ledger.filter(r=>r.block===index+1);return {index,hook:index===0,start:Math.min(...entries.map(r=>r.newStart)),duration:entries.reduce((n,r)=>n+r.duration,0),clips:b.units.map(u=>({name:u.name,path:u.path,fingerprint:u.identity,sourceStart:u.segments[0].source_timerange?.start||0,duration:u.duration,parts:u.segments.map(s=>({start:(s.source_timerange?.start||0)/1e6,duration:(s.source_timerange?.duration||s.target_timerange.duration)/1e6,speed:s.speed||1,volume:s.volume??1}))}))};});
  if(p.source.ending)blocks.at(-1).duration+=p.source.ending.duration;
  batch.projects[i]={id:previous?.id||uid(),name,locked:false,draft:result.draft,ledger:result.ledger,signature:p.signature,blocks,assignments:[],sourceName:p.source.name,reusedPercent:Math.round(100*body.filter(u=>bodyOriginal.has(u.identity)).length/Math.max(1,body.length)),installed:null,...(batch.renderSettings?{settings:structuredClone(batch.renderSettings)}:{})};
 }
 return batch;
}
async function reroll(store,id,projectId){const b=get(store,id),p=b.projects.find(p=>p.id===projectId);if(!p||p.locked||p.installed)throw Error('Dự án đã khóa hoặc đã tạo CapCut.');const target=store.get(b.channelId);await generate(store,b,target.channelName==='Kênh gốc'?target.name:target.channelName,projectId);return save(store,b);}
function lock(store,id,projectId){const b=get(store,id),p=b.projects.find(p=>p.id===projectId);if(!p)throw Error('Không tìm thấy dự án.');p.locked=!p.locked;return save(store,b);}
async function assignMusic(store,id,folders,progress=()=>{},projectId=null){
 const b=get(store,id),lib=require('./media.cjs'),pools={};
 for(const kind of ['hook','body']){if(!folders[kind])throw Error('Chọn thư mục nhạc '+kind);pools[kind]=(await lib.scan(folders[kind],'audio',store,progress)).filter(m=>!m.error&&m.duration>0);}
 for(const p of b.projects.filter(p=>!p.installed&&(projectId?p.id===projectId:(!p.locked||!p.assignments.length)))){
  const slots=p.blocks.map(block=>{const delay=block.hook?Math.min(3e6,block.duration):0;return {block,duration:block.duration-delay,start:block.start+delay};}).filter(s=>s.duration>0);
  const candidates=new Map(slots.map(s=>[s.block.index,[...new Map(pools[s.block.hook?'hook':'body'].filter(m=>Math.round(m.duration*1e6)>=s.duration).map(m=>[m.fingerprint,m])).values()].map(m=>({m,rank:crypto.randomInt(2147483647)})).sort((a,b)=>a.rank-b.rank).map(x=>x.m)]));
  const owners=new Map(),chosen=new Map();
  function match(index,seen){for(const song of candidates.get(index)||[]){if(seen.has(song.fingerprint))continue;seen.add(song.fingerprint);const owner=owners.get(song.fingerprint);if(owner===undefined||match(owner,seen)){owners.set(song.fingerprint,index);chosen.set(index,song);return true;}}return false;}
  for(const slot of [...slots].sort((a,z)=>candidates.get(a.block.index).length-candidates.get(z.block.index).length))if(!match(slot.block.index,new Set()))throw Error(p.name+': không đủ bài khác nhau có độ dài phù hợp.');
  const assign=slots.map(s=>{const song=chosen.get(s.block.index);return {block:s.block.index,path:song.path,name:song.name,fingerprint:song.fingerprint,sourceDuration:song.duration,start:s.start,duration:s.duration};});
  p.assignments=assign.sort((a,z)=>a.block-z.block);
 }
 b.musicFolders=folders;store.pref('remix-settings:'+b.channelId,JSON.stringify({...preferences(store,b.channelId),folders}));return save(store,b);
}
function withMusic(project,settings,audioPieces=null){
 settings=require('./remix-settings.cjs').effective(project,settings);
 const d=structuredClone(project.draft),t=require('./capcut-template.json'),track={...structuredClone(t.audioTrack),id:uid(),name:'Nhạc nhân bản',type:'audio',segments:[]};d.materials.audios??=[];d.materials.audio_fades??=[];
 for(const a of audioPieces||project.assignments){const m={...structuredClone(t.audioMaterial),id:uid(),unique_id:uid(),path:a.path,name:a.name,type:'extract_music',duration:Math.round(a.sourceDuration*1e6)};d.materials.audios.push(m);const fade={id:uid(),type:'audio_fade',fade_type:0,fade_in_duration:0,fade_out_duration:Math.min(a.fadeOut??4e6,a.duration)};d.materials.audio_fades.push(fade);const volume=a.volume??10**((settings.audioVolumeDb??-10)/20),s={...structuredClone(t.audioSegment),id:uid(),material_id:m.id,source_timerange:{start:a.sourceStart||0,duration:a.duration},target_timerange:{start:a.start,duration:a.duration},volume,last_nonzero_volume:volume,extra_material_refs:[fade.id]};
  if(['removeVocals','keepVocals'].includes(settings.musicAudioMode)){const v={id:uid(),type:'vocal_separation',choice:settings.musicAudioMode==='keepVocals'?2:1,removed_sounds:[],time_range:{start:a.sourceStart||0,duration:a.duration},production_path:'',final_algorithm:'vocal_separate',enter_from:'timeline_menu'};(d.materials.vocal_separations||=[]).push(v);s.extra_material_refs.push(v.id);}track.segments.push(s);
 }
 if(track.segments.length)d.tracks.push(track);
 const textTracks=d.tracks.filter(t=>t.type==='text');if(textTracks.length){const merged={...textTracks[0],name:'Credit',segments:textTracks.flatMap(t=>t.segments).sort((a,b)=>a.target_timerange.start-b.target_timerange.start)};d.tracks=d.tracks.flatMap(t=>t.type!=='text'?[t]:t===textTracks[0]?[merged]:[]);}

 for(const m of d.materials.transitions||[])Object.assign(m,require('./transitions.cjs').resolveEffect(m));
 require('./remix-settings.cjs').apply(project,d,settings);
 return d;
}
async function prepare(project,base,options={}){
 const settings=require('./remix-settings.cjs').effective(project,base),duck=require('./ducking.cjs');
 if(!duck.validate(settings).enabled)return withMusic(project,settings);
 const materials=new Map((project.draft.materials.videos||[]).map(m=>[m.id,m]));
 const clips=project.draft.tracks.filter(t=>t.type==='video').flatMap(t=>t.segments.map(seg=>{const m=materials.get(seg.material_id),v=(project.draft.materials.vocal_separations||[]).find(v=>seg.extra_material_refs.includes(v.id));return {path:m.path,kind:m.type==='photo'?'image':'video',hasAudio:m.has_audio,start:seg.target_timerange.start/1e6,duration:seg.target_timerange.duration/1e6,sourceStart:(seg.source_timerange?.start||0)/1e6,sourceDuration:(seg.source_timerange?.duration||seg.target_timerange.duration)/1e6,audioMode:seg.volume===0?'mute':v?.choice===1?'removeVocals':v?.choice===2?'keepVocals':'original'};}));
 const manifest={draft:settings,clips,audio:project.assignments.map(a=>({...a,key:String(a.block),start:a.start/1e6,duration:a.duration/1e6,sourceStart:0,volumeDb:settings.audioVolumeDb,volume:10**(settings.audioVolumeDb/20),fadeOut:Math.min(4,a.duration/1e6)}))};
 await duck.apply(manifest,{...options,analyze:options.analyze||(c=>duck.levels({...c,duration:c.sourceDuration}))});
 return withMusic(project,settings,manifest.audio.map(a=>({...a,start:Math.round(a.start*1e6),duration:Math.round((a.start+a.duration)*1e6)-Math.round(a.start*1e6),sourceStart:Math.round(a.sourceStart*1e6),fadeOut:Math.round(a.fadeOut*1e6)})));
}
function check(batch){
 const missing=new Set(),issues=[];if(!batch.projects.length)issues.push('Bộ nguồn chưa có bản nhân bản.');
 for(const p of batch.projects){if(p.installed)continue;const settings=require('./remix-settings.cjs').effective(p,batch.renderSettings||batch.settings);try{require('./remix-settings.cjs').validate(settings);}catch(e){issues.push(p.name+': '+e.message);}for(const m of p.draft.materials.videos||[])if(m.path&&(!fs.existsSync(m.path)||(batch.transferIssues||[]).some(i=>norm(i.path)===norm(m.path))))missing.add(m.path);for(const a of p.assignments)if(!fs.existsSync(a.path))missing.add(a.path);
  if(p.blocks.some(b=>b.clips.some(c=>!/^([a-f0-9]{64})$/i.test(c.fingerprint||''))))issues.push(p.name+': footage chưa có dấu vân tay. Khôi phục file nguồn rồi trộn lại.');
  if(nameErrors(p.name).length)issues.push(p.name+': tên không hợp lệ.');
  if(p.assignments.length!==p.blocks.filter(b=>!b.hook||b.duration>3e6).length)issues.push(p.name+': chưa gán đủ nhạc.');
  if(new Set(p.assignments.map(a=>a.fingerprint)).size!==p.assignments.length)issues.push(p.name+': nhạc bị trùng.');
  for(const a of p.assignments)if(a.duration>Math.round(a.sourceDuration*1e6))issues.push(p.name+': bài nhạc ngắn hơn block.');
  for(const m of (settings.transition.type==='inherit'?p.draft.materials.transitions||[]:[]))if(m.path&&!fs.existsSync(path.join(require('./transitions.cjs').resolveEffect(m).path,'config.json')))issues.push(p.name+': thiếu chuyển cảnh '+(m.name||m.effect_id));
 }
 return {ok:!missing.size&&!issues.length,missing:[...missing],issues};
}
async function install(store,id,adapter,progress=()=>{},projectId=null){
 const b=get(store,id),selected=b.projects.filter(p=>!projectId||p.id===projectId);if(!selected.length)throw Error('Không tìm thấy bản nháp.');const pre=check({...b,projects:selected});if(!pre.ok)throw Error([...pre.issues,...pre.missing.map(p=>'Thiếu file: '+p)].join('\n'));
 const state=store.get(b.channelId),detected=await adapter.detect(state.draft.destination);if(!detected.compatible)throw Error(detected.reason);
 const writer=require('./capcut-writer.cjs');if(await writer.isRunning())throw Error('Lưu và đóng CapCut trước khi tạo bộ dự án.');
 const names=new Set(detected.existingNames.map(n=>n.toLowerCase()));for(const p of selected.filter(p=>!p.installed))if(names.has(p.name.toLowerCase()))throw Error('Tên đã tồn tại trong CapCut: '+p.name);
 for(const [index,p] of selected.entries())if(!p.installed){
  const draft=await prepare(p,b.renderSettings||b.settings,{progress});writer.validate(draft);
  const manifest={name:p.name,remixBatchId:b.id,draft:{...defaults(),name:p.name},clips:p.blocks.flatMap(bl=>bl.clips.map(c=>({...c,role:bl.hook?'hook':'body'})))};
  const result=await writer.install(manifest,detected.destination,[],writer.isRunning,draft);
  p.installed=result.path;p.locked=true;
  store.db.exec('BEGIN IMMEDIATE');try{const projectId=uid();store.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(projectId,b.channelId,p.name,'REMIX_CREATED',result.path,new Date().toISOString(),JSON.stringify(manifest));store.reserve(b.channelId,manifest.draft.id,manifest);for(const c of manifest.clips)store.db.prepare('INSERT OR IGNORE INTO usage VALUES(?,?,?,?)').run(b.channelId,c.fingerprint,projectId,c.role);save(store,b);store.db.exec('COMMIT');}catch(err){store.db.exec('ROLLBACK');throw Error('CapCut đã tạo '+p.name+' nhưng lưu lịch sử thất bại: '+err.message);}
  progress({done:index+1,total:b.projects.length,file:p.name});
 }
 return b;
}
function removeBatch(store,{id,stateId}){
 const b=get(store,id),s=store.get(stateId),root=s.rootNicheId||s.id;
 if(b.rootId!==root||b.channelId!==stateId)throw Error('Bộ không thuộc kênh đang chọn.');
 store.db.exec('BEGIN IMMEDIATE');try{
  store.pref('deleted-remix:'+id,JSON.stringify({deletedAt:new Date().toISOString(),batch:b}));
  store.db.prepare('DELETE FROM remix_batches WHERE id=?').run(id);
  store.db.exec('COMMIT');
 }catch(e){store.db.exec('ROLLBACK');throw e;}
 return true;
}
module.exports={prepare,removeBatch,present,saveSource,sourcesFromBatch,preferences,list,get,save,sourceProjects,analyzeSources,mix,capture,create,reroll,lock,assignMusic,withMusic,check,install,allSignatures};
