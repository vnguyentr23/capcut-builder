// Editable remix drafts retain native segments instead of flattening split cuts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {uid,nameErrors}=require('./domain.cjs'),remix=require('./remix.cjs');
const clone=structuredClone, end=s=>s.target_timerange.start+s.target_timerange.duration;
function materialMap(d){return new Map(Object.entries(d.materials).flatMap(([type,items])=>Array.isArray(items)?items.map(value=>[value.id,{type,value}]):[]));}
function pack(d,segments,fingerprint,name){
 const map=materialMap(d),start=segments[0].target_timerange.start,stop=end(segments.at(-1));
 const texts=d.tracks.filter(t=>t.type==='text').flatMap(t=>t.segments.filter(s=>s.target_timerange.start>=start-2&&end(s)<=stop+2).map(s=>({track:{...clone(t),segments:[]},segment:clone(s)})));
 const materials={},all=[...segments,...texts.map(t=>t.segment)];
 for(const s of all)for(const id of [s.material_id,...s.extra_material_refs||[]]){const m=map.get(id);if(m&&m.type!=='transitions'){(materials[m.type]??=[]);if(!materials[m.type].some(x=>x.id===id))materials[m.type].push(clone(m.value));}}
 const local=s=>{s=clone(s);s.target_timerange.start-=start;if(s.render_timerange?.duration>0)s.render_timerange.start-=start;s.extra_material_refs=(s.extra_material_refs||[]).filter(id=>map.get(id)?.type!=='transitions');return s;};
 const m=map.get(segments[0].material_id).value;
 return {id:uid(),name:name||m.material_name||path.basename(m.path),path:m.path,fingerprint,materials,segments:segments.map(local),texts:texts.map(t=>({...t,segment:local(t.segment)}))};
}
function init(p){
 if(p.editor)return p.editor;
 const track=p.draft.tracks.find(t=>t.type==='video'),map=materialMap(p.draft);
 const blocks=p.blocks.map((b,bi)=>({id:uid(),hook:bi===0,transitions:[],units:b.clips.map((c,ci)=>{
  const row=p.ledger.find(r=>r.block===bi+1&&r.slot===ci+1);if(!row)throw Error('Bản nhân bản thiếu ánh xạ footage. Hãy trộn lại bản này.');
  const segments=track.segments.filter(s=>row.segmentIds.includes(s.id));return pack(p.draft,segments,c.fingerprint,c.name);
 })}));
 for(let bi=0;bi<blocks.length;bi++){const row=p.ledger.filter(r=>r.block===bi+1).at(-1),s=track.segments.find(s=>s.id===row.segmentIds.at(-1));blocks[bi].transitions=(s.extra_material_refs||[]).map(id=>map.get(id)).filter(m=>m?.type==='transitions').map(m=>clone(m.value));}
 const used=new Set(p.ledger.filter(r=>r.block>0).flatMap(r=>r.segmentIds)),tail=track.segments.filter(s=>!used.has(s.id));
 if(tail.length>1||tail.some(s=>end(s)!==p.draft.duration))throw Error('Có đoạn ngoài Hook/Body chưa ánh xạ được an toàn.');
 p.editor={version:1,revision:0,blocks,ending:tail.length?pack(p.draft,tail,null):null};return p.editor;
}
function audioMode(u,s){if(s.volume===0)return 'mute';const m=(u.materials.vocal_separations||[]).find(m=>s.extra_material_refs?.includes(m.id));return m?.choice===1?'removeVocals':m?.choice===2?'keepVocals':'original';}
function summary(u){
 const parts=u.segments.map(s=>{const m=u.materials.videos.find(m=>m.id===s.material_id),r=s.source_timerange||{start:0,duration:s.target_timerange.duration};return {start:r.start/1e6,end:(r.start+r.duration)/1e6,speed:s.speed||1,volume:s.volume??1,audioMode:audioMode(u,s),sourceDuration:(m.duration||r.start+r.duration)/1e6,protected:!!s.common_keyframes?.length||!!s.keyframe_refs?.length||!!(u.materials.speeds||[]).find(m=>s.extra_material_refs?.includes(m.id)&&m.curve_speed)};});
 const edited=parts.length>1||parts.some(s=>s.start>0||Math.abs(s.end-s.sourceDuration)>.04||s.speed!==1||s.volume!==1||s.audioMode!=='original')||u.segments.some(s=>s.common_keyframes?.length||s.clip?.scale?.x!==1||s.clip?.scale?.y!==1||s.clip?.transform?.x||s.clip?.transform?.y||s.clip?.rotation);
 return {id:u.id,name:u.name,path:u.path,fingerprint:u.fingerprint,kind:u.materials.videos[0]?.type==='photo'?'image':'video',duration:u.segments.reduce((n,s)=>n+s.target_timerange.duration,0)/1e6,parts,edited};
}
function present(p){const e=init(p);return {id:p.id,name:p.name,installed:p.installed,revision:e.revision,settings:p.settings,edited:!!p.editedAt,duration:p.draft.duration/1e6,blocks:e.blocks.map((b,i)=>({id:b.id,hook:i===0,units:b.units.map(summary)})),ending:e.ending?summary(e.ending):null,assignments:p.assignments,canUndo:!!p.editUndo?.length};}
function locate(e,id){for(const b of e.blocks){const i=b.units.findIndex(u=>u.id===id);if(i>=0)return {b,i,u:b.units[i]};}if(e.ending?.id===id)return {u:e.ending,ending:true};throw Error('Footage không còn tồn tại.');}
function rebuild(p){
 const e=init(p),out=clone(p.draft),video=clone(out.tracks.find(t=>t.type==='video'));video.segments=[];
 out.materials=Object.fromEntries(Object.keys(out.materials).map(k=>[k,[]]));out.tracks=[video];let cursor=0;const ledger=[],blocks=[];
 function append(u,bi,slot){
  const start=cursor,ids=new Map(Object.values(u.materials).flat().map(m=>[m.id,uid()]));
  for(const [type,items] of Object.entries(u.materials))for(const m of items){const c=clone(m);c.id=ids.get(m.id);(out.materials[type]??=[]).push(c);}
  const copy=s=>{s=clone(s);s.id=uid();s.material_id=ids.get(s.material_id);s.extra_material_refs=(s.extra_material_refs||[]).map(id=>ids.get(id)).filter(Boolean);s.target_timerange.start+=start;if(s.render_timerange?.duration>0)s.render_timerange.start+=start;return s;};
  const segs=u.segments.map(copy);video.segments.push(...segs);
  for(const t of u.texts)out.tracks.push({...clone(t.track),id:uid(),segments:[copy(t.segment)]});
  const duration=u.segments.reduce((n,s)=>n+s.target_timerange.duration,0);cursor+=duration;
  ledger.push({unitId:u.id,block:bi+1,slot:slot+1,newStart:start,duration,end:cursor,identity:u.fingerprint,segmentIds:segs.map(s=>s.id)});
  return {name:u.name,path:u.path,fingerprint:u.fingerprint,sourceStart:u.segments[0].source_timerange?.start||0,duration,parts:summary(u).parts.map(s=>({start:s.start,duration:s.end-s.start,speed:s.speed,volume:s.volume}))};
 }
 e.blocks.forEach((b,bi)=>{const start=cursor,clips=b.units.map((u,i)=>append(u,bi,i));blocks.push({index:bi,hook:bi===0,start,duration:cursor-start,clips});if(bi<e.blocks.length-1&&video.segments.length)for(const t of b.transitions){const m=clone(t);m.id=uid();m.duration=Math.min(m.duration||350000,video.segments.at(-1).target_timerange.duration);(out.materials.transitions??=[]).push(m);video.segments.at(-1).extra_material_refs.push(m.id);}});
 if(e.ending){append(e.ending,-1,0);blocks.at(-1).duration=cursor-blocks.at(-1).start;}
 out.duration=cursor;out.name=p.name;p.draft=out;p.ledger=ledger;p.blocks=blocks;
 p.assignments=p.assignments.flatMap(a=>{const b=blocks[a.block];if(!b)return [];const delay=b.hook?Math.min(3e6,b.duration):0,duration=b.duration-delay;if(duration<=0||duration>Math.round(a.sourceDuration*1e6))return [];return [{...a,start:b.start+delay,duration}];});
 p.signature=crypto.createHash('sha256').update(JSON.stringify(e.blocks.slice(1).flatMap(b=>b.units.map(u=>u.fingerprint)))).digest('hex');
}
function setParts(u,parts){
 if(parts.length!==u.segments.length)throw Error('Số đoạn cắt không hợp lệ.');let cursor=0;const spans=[];
 u.segments.forEach((s,i)=>{const p=parts[i],old=summary(u).parts[i],m=u.materials.videos.find(m=>m.id===s.material_id),max=(m.duration||0)/1e6;
  if(!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end<=p.start||p.end>max+.001||!Number.isFinite(p.volume)||p.volume<0||p.volume>10||!['original','mute','keepVocals','removeVocals'].includes(p.audioMode))throw Error('Điểm cắt hoặc âm thanh không hợp lệ.');
  const changed=Math.abs(p.start-old.start)>.000001||Math.abs(p.end-old.end)>.000001;
  if(changed&&old.protected)throw Error('Đoạn có keyframe / tốc độ cong: giữ điểm cắt để bảo toàn chỉnh sửa nguồn.');
  const oldStart=s.target_timerange.start,oldDuration=s.target_timerange.duration;
  if(changed)s.source_timerange={start:Math.round(p.start*1e6),duration:Math.round((p.end-p.start)*1e6)};
  const duration=changed?Math.round(s.source_timerange.duration/(s.speed||1)):oldDuration;
  spans.push({oldStart,oldEnd:oldStart+oldDuration,newStart:cursor,duration});s.target_timerange={start:cursor,duration};cursor+=duration;
  if(p.audioMode!==old.audioMode||(changed&&['keepVocals','removeVocals'].includes(p.audioMode))){s.extra_material_refs=(s.extra_material_refs||[]).filter(id=>!u.materials.vocal_separations?.some(m=>m.id===id));if(['keepVocals','removeVocals'].includes(p.audioMode)){const v={id:uid(),type:'vocal_separation',choice:p.audioMode==='keepVocals'?2:1,removed_sounds:[],time_range:clone(s.source_timerange),production_path:'',final_algorithm:'vocal_separate',enter_from:'timeline_menu'};(u.materials.vocal_separations??=[]).push(v);s.extra_material_refs.push(v.id);}}
  if(s.render_timerange?.duration>0)s.render_timerange={start:s.target_timerange.start,duration:s.target_timerange.duration};
  s.volume=p.audioMode==='mute'?0:p.volume;if(s.volume>0)s.last_nonzero_volume=s.volume;
 });
 for(const t of u.texts){const r=t.segment.target_timerange,first=spans.find(s=>r.start<s.oldEnd)||spans.at(-1),last=spans.find(s=>r.start+r.duration<=s.oldEnd+2)||spans.at(-1);const a=first.newStart+Math.max(0,(r.start-first.oldStart)/Math.max(1,first.oldEnd-first.oldStart))*first.duration,b=last.newStart+Math.min(1,(r.start+r.duration-last.oldStart)/Math.max(1,last.oldEnd-last.oldStart))*last.duration;t.segment.target_timerange={start:Math.round(a),duration:Math.max(1,Math.round(b-a))};}
}
function load(store,id,projectId){const b=remix.get(store,id),p=b.projects.find(p=>p.id===projectId);if(!p)throw Error('Không tìm thấy bản nháp.');init(p);p.settings=require('./remix-settings.cjs').effective(p,b.renderSettings||b.settings);return {b,p};}
function open(store,id,projectId){const {b,p}=load(store,id,projectId);remix.save(store,b);return present(p);}
async function candidates(store,id,projectId,unitId){const {b,p}=load(store,id,projectId),at=locate(p.editor,unitId),sources=await remix.analyzeSources(b.sources),used=new Set(p.editor.blocks.flatMap(b=>b.units.map(u=>u.fingerprint)));return sources.flatMap(s=>s.blocks.flatMap((bl,bi)=>bl.units.flatMap((u,slot)=>slot===at.i&&((at.b.hook&&bi===0)||(!at.b.hook&&bi>0&&Math.abs(bi-p.editor.blocks.indexOf(at.b))<=1))&&!used.has(u.identity)?[{sourceId:s.sourceId,unitId:u.id,name:u.name||path.basename(u.path),path:u.path,sourceName:s.name,block:bi,slot,duration:u.duration/1e6}]:[])));}
async function mutate(store,args){
 const {id,projectId,revision,op}=args,{b,p}=load(store,id,projectId),e=p.editor;
 if(p.installed)throw Error('Bản này đã tạo CapCut. Chỉnh tiếp trong CapCut hoặc tạo bản nhân bản mới.');
 if(revision!==e.revision)throw Error('Bản nháp đã thay đổi. Mở lại trước khi lưu.');
 if(op==='undo'){const prev=p.editUndo?.pop();if(!prev)throw Error('Không có thao tác để hoàn tác.');p.editor=prev.editor;p.name=prev.name;p.assignments=prev.assignments;p.settings=prev.settings??p.settings;p.editor.revision=e.revision+1;}
 else {
  (p.editUndo??=[]).push({editor:clone(e),name:p.name,assignments:clone(p.assignments),settings:clone(p.settings)});p.editUndo=p.editUndo.slice(-5);
  if(op==='settings'){p.settings=require('./remix-settings.cjs').validate(clone(args.settings));}
  else if(op==='moveBlock'||op==='removeBlock'){
   const index=e.blocks.findIndex(x=>x.id===args.blockId);
   if(index<=0)throw Error('Chỉ di chuyển hoặc xóa block Body.');
   const oldIds=e.blocks.map(x=>x.id);
   if(op==='removeBlock'){if(e.blocks.length<=2)throw Error('Cần giữ ít nhất một block Body.');e.blocks.splice(index,1);}
   else{const target=index+args.direction;if(![-1,1].includes(args.direction)||target<1||target>=e.blocks.length)throw Error('Vị trí block không hợp lệ.');[e.blocks[index],e.blocks[target]]=[e.blocks[target],e.blocks[index]];}
   p.assignments=p.assignments.flatMap(a=>{const block=e.blocks.findIndex(x=>x.id===oldIds[a.block]);return block<0?[]:[{...a,block}];});
  }
  else if(op==='blockMusic'){
   const index=e.blocks.findIndex(x=>x.id===args.blockId),block=p.blocks[index];if(!block)throw Error('Block không tồn tại.');
   const duration=block.duration-(index===0?Math.min(3e6,block.duration):0);if(duration<=0)throw Error('Hook quá ngắn để thêm nhạc sau 3 giây.');
   const media=require('./media.cjs'),old=p.assignments.find(a=>a.block===index),used=new Set(p.assignments.filter(a=>a.block!==index).map(a=>a.fingerprint));let song;
   if(args.path){song=await media.inspect(args.path,store);if(!['.mp3','.wav','.m4a','.aac','.flac','.ogg','.wma'].includes(path.extname(args.path).toLowerCase()))throw Error('Hãy chọn file âm thanh.');}
   else{const folder=args.folder||b.musicFolders?.[index===0?'hook':'body'];if(!folder)throw Error('Chọn thư mục nhạc trước.');const pool=(await media.scan(folder,'audio',store)).filter(m=>!m.error&&Math.round(m.duration*1e6)>=duration&&!used.has(m.fingerprint)&&m.fingerprint!==old?.fingerprint);if(!pool.length)throw Error('Không có bài khác đủ dài và chưa dùng trong video.');song=pool[crypto.randomInt(pool.length)];}
   if(song.error||!song.duration||Math.round(song.duration*1e6)<duration)throw Error('Bài nhạc ngắn hơn block hoặc không đọc được.');if(used.has(song.fingerprint))throw Error('Bài nhạc đã được dùng trong video.');
   p.assignments=p.assignments.filter(a=>a.block!==index);p.assignments.push({block:index,path:song.path,name:song.name,fingerprint:song.fingerprint,sourceDuration:song.duration,start:block.start+(index===0?3e6:0),duration});p.assignments.sort((a,z)=>a.block-z.block);
  }
  else if(op==='name'){if(nameErrors(args.name).length)throw Error(nameErrors(args.name).join(' '));if(b.projects.some(q=>q.id!==p.id&&q.name.toLowerCase()===args.name.toLowerCase()))throw Error('Tên trùng bản khác trong bộ.');p.name=args.name;}
  else if(op==='parts')setParts(locate(e,args.unitId).u,args.parts);
  else if(op==='endingDuration'){if(!e.ending||summary(e.ending).kind!=='image'||!Number.isFinite(args.duration)||args.duration<.1||args.duration>86400)throw Error('Thời lượng ảnh không hợp lệ.');const n=Math.round(args.duration*1e6);e.ending.segments[0].target_timerange={start:0,duration:n};e.ending.segments[0].source_timerange={start:0,duration:n};e.ending.materials.videos[0].duration=n;}
  else if(op==='remove'){const at=locate(e,args.unitId);if(at.ending)e.ending=null;else{if(at.b.units.length===1)throw Error('Block cần ít nhất một footage; dùng Thay cảnh.');at.b.units.splice(at.i,1);}}
  else if(op==='swap'){const a=locate(e,args.unitId),z=locate(e,args.otherId);if(a.ending||z.ending)throw Error('Không hoán đổi phần kết thúc.');[a.b.units[a.i],z.b.units[z.i]]=[z.u,a.u];}
  else if(op==='replace'){
   const allowed=await candidates(store,id,projectId,args.unitId);if(!allowed.some(c=>c.sourceId===args.sourceId&&c.unitId===args.sourceUnitId))throw Error('Cảnh thay phải cùng vị trí trong block, lấy từ bộ nguồn và chưa có trong video.');
   const sources=await remix.analyzeSources(b.sources),s=sources.find(s=>s.sourceId===args.sourceId),u=s.blocks.flatMap(b=>b.units).find(u=>u.id===args.sourceUnitId),at=locate(e,args.unitId);at.b.units[at.i]=pack(s.draft,u.segments,u.identity,u.name);
  }else if(op==='addHook'||op==='ending'){
   const m=await require('./media.cjs').inspect(args.path,store),t=require('./capcut-template.json');if(m.error)throw Error(m.error);if(op==='addHook'&&m.kind==='image')throw Error('Hook cần file video.');
   if(e.blocks.flatMap(b=>b.units).some(u=>u.fingerprint===m.fingerprint))throw Error('Footage đã có trong video. Dùng Đổi chỗ để chuyển vào Hook.');
   const duration=m.kind==='image'?Number(args.duration||5):m.duration;if(!(duration>0&&duration<=86400))throw Error('Thời lượng không hợp lệ.');
   const material={...clone(t.videoMaterial),id:uid(),path:m.path,material_name:m.name,duration:Math.round(duration*1e6),width:m.width,height:m.height,type:m.kind==='image'?'photo':'video'},segment={...clone(t.videoSegment),id:uid(),material_id:material.id,extra_material_refs:[],source_timerange:{start:0,duration:Math.round(duration*1e6)},target_timerange:{start:0,duration:Math.round(duration*1e6)},volume:1,speed:1};
   const unit={id:uid(),name:m.name,path:m.path,fingerprint:m.fingerprint,materials:{videos:[material]},segments:[segment],texts:[]};if(op==='ending')e.ending=unit;else e.blocks[0].units.push(unit);
  }else throw Error('Thao tác không hợp lệ.');
  e.revision++;
 }
 rebuild(p);p.editedAt=new Date().toISOString();p.locked=true;remix.save(store,b);return present(p);
}
module.exports={open,load,present,summary,pack,init,rebuild,setParts,mutate,candidates,locate};
