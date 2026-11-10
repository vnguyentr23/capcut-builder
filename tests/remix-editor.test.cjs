const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const edit=require('../src/remix-editor.cjs'),remix=require('../src/remix.cjs'),{Store}=require('../src/store.cjs'),{uid,defaults}=require('../src/domain.cjs'),t=require('../src/capcut-template.json');
function fixture(){
 const d=structuredClone(t.base);d.id=uid();d.materials=Object.fromEntries(Object.keys(d.materials).map(k=>[k,[]]));let cursor=0;const segs=[],blocks=[],ledger=[];
 for(let bi=0;bi<3;bi++){const clips=[];for(let ci=0;ci<2;ci++){const m={...structuredClone(t.videoMaterial),id:uid(),path:`clip-${bi}-${ci}.mp4`,duration:30e6},segments=[];d.materials.videos.push(m);const start=cursor;
 for(let k=0;k<(ci===0?2:1);k++){const v={id:uid(),type:'vocal_separation',choice:k?2:1,production_path:'',removed_sounds:[]};d.materials.vocal_separations.push(v);const s={...structuredClone(t.videoSegment),id:uid(),material_id:m.id,source_timerange:{start:(k?8:2)*1e6,duration:4e6},target_timerange:{start:cursor,duration:4e6},extra_material_refs:[v.id],volume:k?.45:.8,speed:1};s.clip={scale:{x:1.6,y:1.6},transform:{x:.1,y:-.2}};cursor+=4e6;segments.push(s);segs.push(s);}
 clips.push({path:m.path,name:m.path,fingerprint:String(bi*2+ci).repeat(64),duration:cursor-start});ledger.push({block:bi+1,slot:ci+1,segmentIds:segments.map(s=>s.id)});
 }blocks.push({index:bi,hook:bi===0,start:bi*12e6,duration:12e6,clips});}
 d.tracks=[{...structuredClone(t.videoTrack),id:uid(),segments:segs}];d.duration=cursor;return {id:uid(),name:'Video_1',draft:d,blocks,ledger,assignments:[],installed:null};
}
test('Native editor maps every split and audio mode, noop rebuild preserves trims, volume, speed and transform',()=>{const p=fixture(),before=p.draft.tracks[0].segments.map(s=>structuredClone(s));const shown=edit.present(p);assert.equal(shown.blocks[0].units[0].parts.length,2);assert.deepEqual(shown.blocks[0].units[0].parts.map(s=>s.audioMode),['removeVocals','keepVocals']);assert(shown.blocks[0].units[0].edited);edit.rebuild(p);p.draft.tracks[0].segments.forEach((s,i)=>{for(const key of ['source_timerange','target_timerange','speed','volume','clip'])assert.deepEqual(s[key],before[i][key]);});});
test('Changing one split preserves other splits; mute maps to zero and shortening retimes remaining blocks/music',()=>{const p=fixture(),e=edit.init(p),u=e.blocks[0].units[0],parts=edit.summary(u).parts;const unchanged=structuredClone(u.segments[1]);parts[0].end-=1;parts[0].audioMode='mute';edit.setParts(u,parts);assert.equal(u.segments[0].volume,0);assert.deepEqual(u.segments[1].source_timerange,unchanged.source_timerange);assert.equal(u.segments[1].volume,unchanged.volume);p.assignments=[{block:1,sourceDuration:100,start:12e6,duration:12e6}];edit.rebuild(p);assert.equal(p.draft.duration,35e6);assert.equal(p.blocks[1].start,11e6);assert.equal(p.assignments[0].start,11e6);});
test('Edits persist per project, stale writes rejected, undo restores native draft, sources untouched',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-edit-')),store=new Store(path.join(dir,'db.sqlite'));try{const s=store.create('A'),p=fixture(),other=fixture(),_unique=other.blocks.forEach(b=>b.clips.forEach(c=>c.fingerprint='a'+c.fingerprint.slice(1))),b={id:uid(),rootId:s.id,channelId:s.id,name:'B',sources:[{id:'source',draft:{untouched:true}}],projects:[p,other],settings:defaults()};remix.save(store,b);let shown=edit.open(store,b.id,p.id),unit=shown.blocks[0].units[0];const result=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'swap',unitId:unit.id,otherId:shown.blocks[1].units[0].id});assert.equal(result.revision,1);await assert.rejects(edit.mutate(store,{id:b.id,projectId:p.id,revision:0,op:'name',name:'X'}),/đã thay đổi/);const saved=remix.get(store,b.id);assert.deepEqual(saved.sources,b.sources);assert.deepEqual(saved.projects[1],other);await edit.mutate(store,{id:b.id,projectId:p.id,revision:1,op:'undo'});assert.equal(edit.open(store,b.id,p.id).blocks[0].units[0].id,unit.id);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM projects').get().n,0);}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}});
test('Protected keyframes refuse destructive recut, still allow independent audio changes',()=>{const p=fixture(),u=edit.init(p).blocks[0].units[0];u.segments[0].common_keyframes=[{id:'key',keyframe_list:[{time_offset:10}]}];const parts=edit.summary(u).parts;parts[0].start++;assert.throws(()=>edit.setParts(u,parts),/keyframe/);});
test('Create CapCut for selected draft only, retain native audio refs and leave other drafts pending',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-single-')),store=new Store(path.join(dir,'db.sqlite')),writer=require('../src/capcut-writer.cjs'),running=writer.isRunning;
 try{writer.isRunning=async()=>false;const s=store.create('Single'),p=fixture(),other=fixture();other.name='Other';for(const b of other.blocks)for(const c of b.clips)c.fingerprint='a'+c.fingerprint.slice(1);for(const m of p.draft.materials.videos){m.path=path.join(dir,path.basename(m.path));fs.writeFileSync(m.path,'video');}for(const b of p.blocks)for(const c of b.clips)c.path=path.join(dir,c.path);
  p.assignments=p.blocks.map((b,i)=>{const file=path.join(dir,`song-${i}.mp3`);require('node:child_process').execFileSync('C:/ffmpeg/bin/ffmpeg.exe',['-v','error','-f','lavfi','-i','sine=duration=100','-y',file],{windowsHide:true});return {block:i,path:file,name:path.basename(file),fingerprint:String(i).repeat(64),sourceDuration:100,start:b.start+(i===0?3e6:0),duration:b.duration-(i===0?3e6:0)};});
  p.settings=require('../src/remix-settings.cjs').initial();p.settings.ducking.enabled=false;const root=path.join(dir,'capcut');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'root_meta_info.json'),JSON.stringify({all_draft_store:[],draft_ids:[]}));const b={id:uid(),rootId:s.id,channelId:s.id,name:'Batch',sources:[],projects:[p,other],settings:defaults()};remix.save(store,b);
  const result=await remix.install(store,b.id,{detect:async()=>({compatible:true,destination:root,existingNames:[]})},()=>{},p.id);assert(result.projects[0].installed);assert.equal(result.projects[1].installed,null);assert.equal(store.history(s.id).length,1);
  const d=JSON.parse(fs.readFileSync(path.join(result.projects[0].installed,'draft_content.json')));const video=d.tracks.find(t=>t.type==='video');assert.deepEqual(video.segments[0].source_timerange,p.draft.tracks[0].segments[0].source_timerange);assert(d.materials.vocal_separations.some(m=>m.choice===2));
  const firstPath=result.projects[0].installed,first=fs.readFileSync(path.join(firstPath,'draft_content.json'),'utf8'),count=result.projects.length;
  const again=await remix.install(store,b.id,{detect:async()=>({compatible:true,destination:root,existingNames:[p.name]})},()=>{},p.id);
  assert.equal(again.projects.length,count);assert.equal(again.projects[0].id,p.id);assert.notEqual(again.projects[0].installed,firstPath);assert.equal(fs.readFileSync(path.join(firstPath,'draft_content.json'),'utf8'),first);
  const repeated=JSON.parse(fs.readFileSync(path.join(again.projects[0].installed,'draft_content.json')));assert.equal(repeated.name,p.name+' - xuất lại 2');assert.equal(repeated.duration,d.duration);const geometry=x=>x.tracks.find(t=>t.type==='video').segments.map(s=>({source:s.source_timerange,target:s.target_timerange,volume:s.volume,clip:s.clip,material:s.material_id}));assert.deepEqual(geometry(repeated),geometry(d));

 }finally{writer.isRunning=running;store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Block moves and deletion keep songs attached, retime output and undo restores all',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-block-')),store=new Store(path.join(dir,'db.sqlite'));
 try{const state=store.create('Blocks'),p=fixture();p.assignments=p.blocks.map((b,i)=>({block:i,name:'song'+i,sourceDuration:100,start:b.start,duration:b.duration}));const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p],settings:defaults()};remix.save(store,b);
 let shown=edit.open(store,b.id,p.id);const ids=shown.blocks.map(b=>b.id),run=async(op,args={})=>shown=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op,...args});
 await run('moveBlock',{blockId:ids[2],direction:-1});assert.deepEqual(shown.blocks.map(b=>b.id),[ids[0],ids[2],ids[1]]);assert.equal(shown.assignments.find(a=>a.name==='song2').block,1);assert.equal(shown.assignments.find(a=>a.name==='song2').start,12e6);
 await run('removeBlock',{blockId:ids[2]});assert.equal(shown.duration,24);assert.equal(shown.assignments.length,2);assert.equal(shown.assignments.find(a=>a.name==='song1').block,1);await assert.rejects(run('removeBlock',{blockId:ids[1]}),/ít nhất/);await run('undo');assert.equal(shown.blocks.length,3);assert.equal(shown.assignments.length,3);await assert.rejects(run('moveBlock',{blockId:ids[0],direction:1}),/Body/);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Replace block music only changes selected block and validates uniqueness and duration',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-song-')),store=new Store(path.join(dir,'db.sqlite')),media=require('../src/media.cjs'),inspect=media.inspect,scan=media.scan;
 try{const state=store.create('Songs'),p=fixture();p.assignments=[{block:1,name:'keep',fingerprint:'used',sourceDuration:100,start:12e6,duration:12e6}];const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p],settings:defaults()};remix.save(store,b);let shown=edit.open(store,b.id,p.id);const run=async(args)=>shown=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'blockMusic',blockId:shown.blocks[2].id,...args});
 media.inspect=async()=>({name:'new',path:'new.mp3',duration:100,fingerprint:'fresh'});await run({path:'new.mp3'});assert.equal(shown.assignments[0].name,'keep');assert.equal(shown.assignments[1].duration,12e6);
 media.inspect=async()=>({name:'dup',duration:100,fingerprint:'used'});await assert.rejects(run({path:'dup.mp3'}),/đã được dùng/);media.inspect=async()=>({duration:1,fingerprint:'short'});await assert.rejects(run({path:'short.mp3'}),/ngắn hơn/);
 media.scan=async()=>[{name:'random',path:'random.mp3',duration:100,fingerprint:'random'}];await run({folder:'music'});assert.equal(shown.assignments[1].name,'random');assert.equal(shown.assignments[0].name,'keep');
 }finally{media.inspect=inspect;media.scan=scan;store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Re-export copy preserves original installed project and native edits with unique version names',async()=>{const store=new Store(':memory:');try{const state=store.create('Copy'),p=fixture();p.installed='C:/existing-project';p.settings=require('../src/remix-settings.cjs').initial();const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p],settings:defaults()};remix.save(store,b);const copy=edit.copyForExport(store,b.id,p.id,['Video_1_v2']);assert.equal(copy.name,'Video_1_v3');assert.equal(copy.installed,null);const saved=remix.get(store,b.id);assert.deepEqual(saved.projects[0],p);assert.deepEqual(saved.projects[1].blocks,p.blocks);assert.deepEqual(saved.projects[1].editor.blocks[0].units.map(u=>u.segments),edit.init(structuredClone(p)).blocks[0].units.map(u=>u.segments));assert.notEqual(copy.id,p.id);await edit.mutate(store,{id:b.id,projectId:copy.id,revision:copy.revision,op:'name',name:'Edited_copy'});assert.equal(remix.get(store,b.id).projects[0].name,'Video_1');assert.throws(()=>edit.copyForExport(store,b.id,copy.id),/chưa tạo/);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM projects').get().n,0);}finally{store.close();}});

test('Replacement excludes exported footage across batches in same channel but permits Hook reuse, rechecks stale picks',async()=>{const store=new Store(':memory:'),analyze=remix.analyzeSources;try{const state=store.create('Filter'),p=fixture(),b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p],settings:defaults()};remix.save(store,b);const shown=edit.open(store,b.id,p.id),unitId=shown.blocks[1].units[0].id;remix.analyzeSources=async()=>[{sourceId:'src',name:'Source',blocks:[{units:[]},{units:[{id:'candidate',identity:'candidate-fp',name:'Candidate',path:'clip.mp4',duration:1e6}]}]}];assert.equal((await edit.candidates(store,b.id,p.id,unitId)).length,1);const sibling=require('../src/channels.cjs').create(store,state.id,'Sibling');const other={...b,id:uid(),channelId:sibling.id,projects:[{...fixture(),installed:'existing',blocks:[{clips:[{fingerprint:'candidate-fp'}]}]}]};remix.save(store,other);assert.equal((await edit.candidates(store,b.id,p.id,unitId)).length,1);other.id=uid();other.channelId=state.id;remix.save(store,other);assert.equal((await edit.candidates(store,b.id,p.id,unitId)).length,0);await assert.rejects(edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'replace',unitId,sourceId:'src',sourceUnitId:'candidate'}),/đã tạo CapCut/);store.db.prepare('DELETE FROM remix_batches WHERE id=?').run(other.id);store.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run('export',state.id,'Export','REMIX_CREATED','path','now','{}');store.db.prepare('INSERT INTO usage VALUES(?,?,?,?)').run(state.id,'candidate-fp','export','hook');assert.equal((await edit.candidates(store,b.id,p.id,unitId)).length,0);remix.analyzeSources=async()=>[{sourceId:'src',name:'Source',blocks:[{units:[{id:'candidate',identity:'candidate-fp',name:'Candidate',path:'clip.mp4',duration:1e6}]}]}];assert.equal((await edit.candidates(store,b.id,p.id,shown.blocks[0].units[0].id)).length,1);}finally{remix.analyzeSources=analyze;store.close();}});
test('Swap block music with Hook retimes songs and rejects a short song atomically',async()=>{
 const store=new Store(':memory:');
 try{
  const state=store.create('Swap'),p=fixture();p.assignments=[{block:0,name:'Hook',path:'h.mp3',fingerprint:'h',sourceDuration:100,start:3e6,duration:9e6},{block:1,name:'Body',path:'b.mp3',fingerprint:'b',sourceDuration:100,start:12e6,duration:12e6}];
  const batch={id:uid(),rootId:state.id,channelId:state.id,name:'Batch',sources:[],projects:[p],settings:defaults()};remix.save(store,batch);
  let shown=edit.open(store,batch.id,p.id);
  shown=await edit.mutate(store,{id:batch.id,projectId:p.id,revision:shown.revision,op:'swapMusicHook',blockId:shown.blocks[1].id});
  assert.equal(shown.assignments[0].name,'Body');assert.equal(shown.assignments[0].start,3e6);assert.equal(shown.assignments[0].duration,9e6);assert.equal(shown.assignments[1].name,'Hook');
  const saved=remix.get(store,batch.id);saved.projects[0].assignments[0].sourceDuration=10;remix.save(store,saved);
  const before=JSON.stringify(remix.get(store,batch.id));
  await assert.rejects(edit.mutate(store,{id:batch.id,projectId:p.id,revision:shown.revision,op:'swapMusicHook',blockId:shown.blocks[1].id}),/không đủ dài/);
  assert.equal(JSON.stringify(remix.get(store,batch.id)),before);
 }finally{store.close();}
});

test('Allocation preserves footage shared by installed and pending drafts',()=>{
 const store=new Store(':memory:');try{const state=store.create('Allocation'),fixed=fixture(),a=fixture(),b=fixture();fixed.installed='capcut';const original=JSON.stringify(fixed);
 const batch={id:uid(),rootId:state.id,channelId:state.id,sources:[],projects:[fixed,a,b],settings:defaults()};
 const allocation=require('../src/remix-allocation.cjs'),snapshot=JSON.stringify(batch);
 assert.equal(allocation.reconcile(store,batch),0);assert.equal(JSON.stringify(batch),snapshot);assert.equal(JSON.stringify(fixed),original);
 }finally{store.close();}
});
test('Copyright repair only empties blocked units in the requested project',()=>{
 const store=new Store(':memory:');try{
  const state=store.create('Allocation'),a=fixture(),b=fixture(),before=structuredClone(b);
  const unit=structuredClone(edit.init(a).blocks[1].units[0]);
  require('../src/blacklist.cjs').merge(store,[{type:'footage',value:unit.fingerprint}]);
  const allocation=require('../src/remix-allocation.cjs'),batch={channelId:state.id,projects:[a,b]};
  assert.equal(allocation.reconcile(store,batch,new Set([a.id])),1);
  assert.deepEqual(a.editor.blocks[1].units[0].removedFootage,unit);
  assert(a.editor.blocks[1].units[0].empty);assert.deepEqual(b,before);
 }finally{store.close();}
});
test('Empty slots support swap, fill, persisted reopening and export without blank timeline segments',async()=>{
 const store=new Store(':memory:'),analyze=remix.analyzeSources;try{const state=store.create('Slots'),p=fixture(),other=fixture();other.blocks.forEach(b=>b.clips.forEach(c=>c.fingerprint='a'+c.fingerprint.slice(1)));const e=edit.init(p),empty=require('../src/remix-allocation.cjs').empty;
 e.blocks[1].units[0]=empty('Thiếu footage');e.blocks[2].units=e.blocks[2].units.map(()=>empty('Thiếu footage'));edit.rebuild(p);
 const batch={id:uid(),name:'Empty slots',rootId:state.id,channelId:state.id,sources:[],projects:[p,other],settings:defaults()};remix.save(store,batch);let shown=edit.open(store,batch.id,p.id);
 const gap=shown.blocks[1].units[0].id,clip=shown.blocks[1].units[1].id;shown=await edit.mutate(store,{id:batch.id,projectId:p.id,revision:shown.revision,op:'swap',unitId:gap,otherId:clip});assert(shown.blocks[1].units[1].empty);assert(!shown.blocks[1].units[0].empty);
 const source=fixture(),u=source.ledger.find(r=>r.block===2&&r.slot===2),hash='f'.repeat(64);remix.analyzeSources=async()=>[{sourceId:'source',name:'Source',draft:source.draft,blocks:[{units:[]},{units:[{id:'unused'},{id:'free',identity:hash,name:'Free',path:'free.mp4',duration:4e6,segments:source.draft.tracks[0].segments.filter(s=>u.segmentIds.includes(s.id))}]}]}];
 const choices=await edit.candidates(store,batch.id,p.id,gap);assert.equal(choices.length,1);
 shown=await edit.mutate(store,{id:batch.id,projectId:p.id,revision:shown.revision,op:'replace',unitId:gap,sourceId:'source',sourceUnitId:'free'});assert.equal(shown.blocks[1].units[1].fingerprint,hash);assert(shown.blocks[2].units.every(u=>u.empty));
 const saved=remix.get(store,batch.id).projects[0],settings=require('../src/remix-settings.cjs').initial();settings.transition.type='none';const out=remix.withMusic(saved,settings);for(const m of out.materials.videos)m.path=__filename;require('../src/capcut-writer.cjs').validate(out);let cursor=0;for(const s of out.tracks.find(t=>t.type==='video').segments){assert.equal(s.target_timerange.start,cursor);cursor+=s.target_timerange.duration;}assert.equal(out.duration,cursor);assert.equal(edit.open(store,batch.id,p.id).blocks[2].units.length,2);
 }finally{remix.analyzeSources=analyze;store.close();}
});

test('Transitions skip empty Hook and empty middle blocks without duplicate boundary effects',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-empty-transition-'));try{fs.writeFileSync(path.join(dir,'config.json'),'{}');const p=fixture(),e=edit.init(p),empty=require('../src/remix-allocation.cjs').empty;
 e.blocks[0].units=e.blocks[0].units.map(()=>empty('Empty'));e.blocks.splice(2,0,{id:uid(),hook:false,transitions:[],units:[empty('Empty')]});edit.rebuild(p);
 const settings=require('../src/remix-settings.cjs').initial();settings.transition={type:'local',duration:.3,resource:{effectId:'test',effectType:19,path:dir}};const d=structuredClone(p.draft);require('../src/remix-settings.cjs').apply(p,d,settings);assert.equal(d.materials.transitions.length,1);assert.equal(d.tracks.find(t=>t.type==='video').segments.filter(s=>s.extra_material_refs.includes(d.materials.transitions[0].id)).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Reblock keeps Hook, native edits and order; clears only Body music and is idempotent',()=>{const p=fixture(),e=edit.init(p),hook=structuredClone(e.blocks[0]),units=structuredClone(e.blocks.slice(1).flatMap(b=>b.units));p.assignments=[{block:0,sourceDuration:100},{block:1,sourceDuration:100}];assert(edit.reblock(p,3));assert.deepEqual(p.editor.blocks[0],hook);assert.deepEqual(p.editor.blocks.slice(1).map(b=>b.units.length),[3,1]);assert.deepEqual(p.editor.blocks.slice(1).flatMap(b=>b.units),units);assert.equal(p.draft.duration,36e6);assert.deepEqual(p.assignments.map(a=>a.block),[0]);assert.equal(edit.reblock(p,3),false);assert.throws(()=>edit.reblock(p,0));});
test('Batch reblock skips exported projects and saves undo',()=>{const store=new Store(':memory:');try{const state=store.create('N'),p=fixture(),done=fixture();done.installed='capcut';const batch={id:uid(),rootId:state.id,channelId:state.id,name:'Batch',projects:[p,done],sources:[],settings:defaults()};remix.save(store,batch);const settings=require('../src/remix-settings.cjs'),info=settings.batchSettings(store,batch.id);info.settings.reblockEnabled=true;info.settings.blockSize=3;settings.applyBatch(store,{id:batch.id,settings:info.settings,updated:info.updated});const saved=remix.get(store,batch.id);assert.deepEqual(saved.projects[1],done);assert.deepEqual(saved.projects[0].editor.blocks.map(b=>b.units.length),[2,3,1]);assert.equal(saved.projects[0].editUndo.length,1);}finally{store.close();}});
test('Exported draft can edit trims, settings, swap existing Body and undo without unlocking batch shuffle',async()=>{const store=new Store(':memory:');try{const state=store.create('Edit exported'),p=fixture();p.installed='existing-capcut';p.locked=true;const b={id:uid(),name:'Batch',rootId:state.id,channelId:state.id,projects:[p],sources:[],settings:defaults()};remix.save(store,b);let shown=edit.open(store,b.id,p.id);const u=shown.blocks[1].units[0],parts=structuredClone(u.parts);parts[0].start+=1;shown=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'parts',unitId:u.id,parts});assert.equal(shown.blocks[1].units[0].parts[0].start,3);const settings=structuredClone(shown.settings);settings.audioVolumeDb=-18;shown=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'settings',settings});assert.equal(shown.settings.audioVolumeDb,-18);shown=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'swap',unitId:shown.blocks[1].units[0].id,otherId:shown.blocks[2].units[0].id});assert.equal(shown.blocks[2].units[0].id,u.id);shown=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'undo'});assert.equal(shown.blocks[1].units[0].id,u.id);const saved=remix.get(store,b.id).projects[0];assert.equal(saved.installed,'existing-capcut');assert.equal(saved.locked,true);}finally{store.close();}});
test('Opening, editing and failed export never erase conflicting footage in any draft',async()=>{
 const store=new Store(':memory:');try{
  const state=store.create('No destructive validation'),p=fixture(),other=fixture();other.name='Other';
  const b={id:uid(),name:'B',rootId:state.id,channelId:state.id,projects:[p,other],sources:[],settings:defaults()};remix.save(store,b);
  let shown=edit.open(store,b.id,p.id);assert(shown.blocks.every(b=>b.units.every(u=>!u.empty)));
  const settings=structuredClone(shown.settings);settings.audioVolumeDb=-18;
  await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'settings',settings});
  const before=remix.get(store,b.id);assert.deepEqual(before.projects[1],other);assert.equal(before.projects[0].draft.duration,p.draft.duration);
  await assert.rejects(remix.install(store,b.id,{detect:()=>{throw Error('Should not detect');}},()=>{},p.id),/chưa gán đủ nhạc|Thiếu file/);
  assert.deepEqual(remix.get(store,b.id),before);
 }finally{store.close();}
});

test('Peer grid uses exact block including Hook; swaps native units and paired undo without touching exported drafts',async()=>{
 const store=new Store(':memory:');try{
 const state=store.create('Grid'),p=fixture(),peer=fixture(),done=fixture();
 for(const [i,x] of [peer,done].entries())for(const bl of x.blocks)for(const c of bl.clips)c.fingerprint=String(i+8)+c.fingerprint.slice(1);
 done.installed={path:'exported'};const b={id:uid(),rootId:state.id,channelId:state.id,name:'Grid',sources:[],projects:[p,peer,done],settings:defaults()};remix.save(store,b);
 const shown=edit.open(store,b.id,p.id),id=shown.blocks[1].units[0].id;
 const choices=edit.swapCandidates(store,b.id,p.id,id);assert.equal(choices.length,2);assert(choices.every(c=>c.peerId===peer.id&&c.block===1));
 assert.equal(edit.swapCandidates(store,b.id,p.id,shown.blocks[0].units[0].id).length,2);
 const before=remix.get(store,b.id),c=choices[1];
 const changed=await edit.mutate(store,{id:b.id,projectId:p.id,revision:shown.revision,op:'swapPeer',unitId:id,peerId:c.peerId,otherId:c.unitId,peerRevision:c.peerRevision});
 const after=remix.get(store,b.id);assert.equal(changed.blocks[1].units[0].id,c.unitId);assert.equal(after.projects[1].editor.blocks[1].units[1].id,id);assert.deepEqual(after.projects[2],before.projects[2]);
 assert.deepEqual(after.projects[0].editor.blocks[1].units[0].segments,edit.init(before.projects[1]).blocks[1].units[1].segments);
 await edit.mutate(store,{id:b.id,projectId:p.id,revision:changed.revision,op:'undo'});
 const undone=remix.get(store,b.id);assert.equal(undone.projects[0].editor.blocks[1].units[0].id,id);assert.equal(undone.projects[1].editor.blocks[1].units[1].id,c.unitId);
 }finally{store.close();}
});

test('Peer choices exclude locked and duplicate destinations; stale selection cannot mutate either draft',async()=>{
 const store=new Store(':memory:');try{
 const state=store.create('Filters'),p=fixture(),peer=fixture();for(const bl of peer.blocks)for(const c of bl.clips)c.fingerprint='b'+c.fingerprint.slice(1);
 edit.init(p);edit.init(peer);peer.editor.blocks[1].units[0].fingerprint=p.editor.blocks[0].units[0].fingerprint;
 const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p,peer],settings:defaults()};remix.save(store,b);
 const id=p.editor.blocks[1].units[0].id,rows=edit.swapCandidates(store,b.id,p.id,id);assert.equal(rows.length,1);
 const before=store.db.prepare('SELECT data FROM remix_batches WHERE id=?').get(b.id).data;
 await assert.rejects(edit.mutate(store,{id:b.id,projectId:p.id,revision:0,op:'swapPeer',unitId:id,peerId:peer.id,otherId:rows[0].unitId,peerRevision:99}),/đã thay đổi/);
 assert.equal(store.db.prepare('SELECT data FROM remix_batches WHERE id=?').get(b.id).data,before);
 peer.locked=true;remix.save(store,b);assert.equal(edit.swapCandidates(store,b.id,p.id,id).length,0);
 }finally{store.close();}
});

test('In-project swaps allow reused footage with location badges and preserve peer projects',async()=>{
 const store=new Store(':memory:');try{
 const state=store.create('Free swap'),p=fixture(),peer=fixture();edit.init(p);edit.init(peer);
 peer.editor.blocks[1].units[0].fingerprint=p.editor.blocks[0].units[0].fingerprint;
 const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p,peer],settings:defaults()};remix.save(store,b);
 const before=structuredClone(peer),hook=p.editor.blocks[0].units[0].id,body=p.editor.blocks[1].units[0].id;
 const result=await edit.mutate(store,{id:b.id,projectId:p.id,revision:0,op:'swap',unitId:hook,otherId:body});
 assert.equal(result.blocks[1].units[0].id,hook);assert.equal(result.blocks[0].units[0].id,body);assert(result.blocks[1].units[0].otherLocations.some(x=>x.includes(peer.name)));assert.equal(result.warnings,undefined);
 assert.deepEqual(remix.get(store,b.id).projects[1],before);
 const next=await edit.mutate(store,{id:b.id,projectId:p.id,revision:result.revision,op:'swap',unitId:hook,otherId:result.blocks[2].units[0].id});assert(next.blocks[2].units[0].otherLocations.length>0);
 await edit.mutate(store,{id:b.id,projectId:p.id,revision:next.revision,op:'undo'});assert.equal(edit.open(store,b.id,p.id).blocks[1].units[0].id,hook);
 }finally{store.close();}
});

test('Light music preview preserves block timing and invalidates after saving a new assignment',()=>{
 const store=new Store(':memory:');try{const state=store.create('Preview'),p=fixture();edit.init(p);p.assignments=[{block:0,name:'First',duration:9e6}];const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p],settings:defaults()};remix.save(store,b);
 const first=remix.musicPreview(store,b.id,p.id);assert.deepEqual(first.p.blocks,p.blocks);assert.deepEqual(first.p.assignments,p.assignments);assert.deepEqual(first.p.editor.blocks,p.editor.blocks.map(x=>({id:x.id})));assert.equal(first.p.draft,undefined);
 p.assignments[0].name='Second';remix.save(store,b);assert.equal(remix.musicPreview(store,b.id,p.id).p.assignments[0].name,'Second');
 }finally{store.close();}
});

test('Blocked footage is marked in presentation without removing clips or changing duration',()=>{
 const store=new Store(':memory:');try{const state=store.create('Blocked'),p=fixture();edit.init(p);const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p],settings:defaults()};remix.save(store,b);
 require('../src/blacklist.cjs').merge(store,[{type:'footage',value:p.editor.blocks[0].units[0].fingerprint,name:'Blocked clip'}]);
 const shown=edit.open(store,b.id,p.id);assert.equal(shown.blocks[0].units[0].copyrightBlocked,'Blocked clip');assert.equal(shown.blocks[0].units[0].empty,undefined);assert.equal(shown.duration,p.draft.duration/1e6);assert.equal(shown.blocks.flatMap(b=>b.units).length,6);
 }finally{store.close();}
});

test('Swap picker marks exported copies while retaining eligible unexported peers',()=>{
 const store=new Store(':memory:');try{
 const state=store.create('Export marker'),p=fixture(),peer=fixture(),done=fixture();
 for(const x of [peer,done])for(const bl of x.blocks)for(const c of bl.clips)c.fingerprint='d'+c.fingerprint.slice(1);
 done.installed={path:'capcut'};done.mixUnlocked=true;done.locked=false;
 const b={id:uid(),rootId:state.id,channelId:state.id,name:'B',sources:[],projects:[p,peer,done],settings:defaults()};remix.save(store,b);
 const shown=edit.open(store,b.id,p.id);
 for(const index of [0,1]){const rows=edit.swapCandidates(store,b.id,p.id,shown.blocks[index].units[0].id);assert.equal(rows.length,2);assert(rows.every(c=>c.peerId===peer.id&&c.exportedBefore));}
 }finally{store.close();}
});
