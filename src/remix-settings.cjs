const fs=require('node:fs'),path=require('node:path');
const {defaults,uid}=require('./domain.cjs');
function initial(base={}){const d=defaults();return {musicAlignment:base.musicAlignment||'start',ducking:{...require('./ducking.cjs').defaults(),...base.ducking},audioVolumeDb:base.audioVolumeDb??d.audioVolumeDb,musicAudioMode:base.musicAudioMode??d.musicAudioMode,zoomEnabled:false,vertical:{...d.vertical,...base.vertical},textEnabled:false,text:{...d.text,...base.text},transition:{type:['local','none','inherit'].includes(base.transition?.type)?base.transition.type:'inherit',duration:base.transition?.duration??.35,resource:structuredClone(base.transition?.resource||null)},endEffect:{enabled:false,duration:3,resource:null}};}
function effective(project,base={}){
 const s=structuredClone(project.settings||base);const result={...initial(base),...s};
 if(result.transition?.resource)result.transition.resource=require('./transitions.cjs').resolveEffect(result.transition.resource);
 if(result.endEffect?.resource)result.endEffect.resource=require('./transitions.cjs').resolveEffect(result.endEffect.resource);
 return result;
}
function validate(s){
 require('./ducking.cjs').validate(s);
 const range=(v,a,b,label)=>{if(!Number.isFinite(v)||v<a||v>b)throw Error(label+' không hợp lệ.');};
 if(!['start','audibleEnd'].includes(s.musicAlignment||'start'))throw Error('Chế độ căn nhạc không hợp lệ.');
 range(s.audioVolumeDb,-60,20,'Âm lượng nhạc');if(!['original','removeVocals','keepVocals'].includes(s.musicAudioMode))throw Error('Chế độ âm thanh nhạc không hợp lệ.');
 range(s.vertical?.scale,.01,10,'Zoom');if(!['inherit','none','local'].includes(s.transition?.type))throw Error('Chuyển cảnh không hợp lệ.');range(s.transition.duration,.01,5,'Thời lượng chuyển cảnh');
 if(s.transition.type==='local'){const r=s.transition.resource;if(!r?.effectId||r.effectType!==19||!r.path||!fs.existsSync(path.join(r.path,'config.json')))throw Error('Chọn chuyển cảnh CapCut đã tải.');}
 if(s.textEnabled){const t=s.text;range(t.size,1,300,'Cỡ chữ');range(t.scale,.01,10,'Tỉ lệ chữ');range(t.opacity,0,1,'Độ đậm');range(t.stroke,0,30,'Viền');range(t.marginLeft,0,1919,'Lề trái');range(t.marginBottom,0,1079,'Lề dưới');if(!/^#[a-f0-9]{6}$/i.test(t.color)||!/^#[a-f0-9]{6}$/i.test(t.strokeColor))throw Error('Màu chữ không hợp lệ.');require('./capcut-writer.cjs').fontFile(t.font);}
 if(s.endEffect?.enabled)require('./end-effect.cjs').timing(s.endEffect,60);
 return s;
}
function apply(project,d,s){
 validate(s);const videos=d.tracks.filter(t=>t.type==='video').flatMap(t=>t.segments),mats=new Map((d.materials.videos||[]).map(m=>[m.id,m]));
 if(s.zoomEnabled)for(const seg of videos){const m=mats.get(seg.material_id);if(m.type==='photo'||!m.height||Math.abs(m.width/m.height-9/16)>=.02)continue;seg.clip??={};seg.clip.scale={x:s.vertical.scale,y:s.vertical.scale};seg.uniform_scale={on:true,value:1};seg.common_keyframes=(seg.common_keyframes||[]).filter(k=>!/scale/i.test(k.property_type||''));}
 if(s.transition.type!=='inherit'){
  const ids=new Set((d.materials.transitions||[]).map(m=>m.id));for(const seg of videos)seg.extra_material_refs=seg.extra_material_refs.filter(id=>!ids.has(id));d.materials.transitions=[];
  if(s.transition.type==='local')for(const b of project.blocks.slice(0,-1)){const boundary=b.start+b.duration,seg=videos.find(seg=>seg.target_timerange.start+seg.target_timerange.duration===boundary);if(!seg)throw Error('Không tìm thấy ranh giới block.');const r=s.transition.resource,m={id:uid(),type:'transition',name:r.name,effect_id:r.effectId,resource_id:r.resourceId||r.effectId,third_resource_id:'0',source_platform:1,path:r.path.replaceAll('\\','/'),duration:Math.min(Math.round(s.transition.duration*1e6),seg.target_timerange.duration),is_overlap:true,platform:'all',category_id:'100000',category_name:'',request_id:'',is_ai_transition:false,video_path:'',task_id:''};d.materials.transitions.push(m);seg.extra_material_refs.push(m.id);}
 }
 // Backfill missing Hook credits for old drafts and newly imported/replaced footage.
 for(const row of (project.ledger||[]).filter(r=>r.block===1)){
  const ids=new Set(row.segmentIds),parts=videos.filter(v=>ids.has(v.id));if(!parts.length)continue;
  const start=Math.min(...parts.map(v=>v.target_timerange.start)),end=Math.max(...parts.map(v=>v.target_timerange.start+v.target_timerange.duration));
  const existing=d.tracks.filter(t=>t.type==='text').flatMap(t=>t.segments);
  if(existing.some(t=>t.target_timerange.start<end&&t.target_timerange.start+t.target_timerange.duration>start))continue;
  const m=mats.get(parts[0].material_id),unit=project.editor?.blocks[0]?.units.find(u=>u.id===row.unitId);let source=unit?.source||'';
  if(!source&&m.path)try{source=fs.readFileSync(m.path.replace(/\.[^.]+$/,'.txt'),'utf8').trim().slice(0,2000);}catch{}
  if(!source)source=path.basename(m.path||m.material_name||unit?.name||'').replace(/\.[^.]+$/,'').replace(/(?:\s*\(\d+\))+$/,'').trim();
  if(!source)continue;
  const template=require('./capcut-template.json'),segment=structuredClone(template.textSegment);Object.assign(segment,{id:uid(),source_timerange:null,target_timerange:{start,duration:end-start},render_timerange:{start:0,duration:0},extra_material_refs:[],common_keyframes:[],keyframe_refs:[],group_id:'',raw_segment_id:''});
  const text=require('./capcut-writer.cjs').makeText({source,path:m.path||source,text:s.text},segment);segment.material_id=text.id;(d.materials.texts??=[]).push(text);
  let track=d.tracks.find(t=>t.type==='text');if(!track){track={...structuredClone(template.textTrack),id:uid(),type:'text',name:'Credit',segments:[]};d.tracks.push(track);}track.segments.push(segment);track.segments.sort((a,b)=>a.target_timerange.start-b.target_timerange.start);
 }
 if(s.textEnabled){const texts=new Map((d.materials.texts||[]).map(m=>[m.id,m]));for(const t of d.tracks.filter(t=>t.type==='text'))for(const seg of t.segments){const old=texts.get(seg.material_id);if(!old)continue;let content;try{content=JSON.parse(old.content).text;}catch{throw Error('Không đọc được chữ nguồn.');}if(!content)continue;const m=require('./capcut-writer.cjs').makeText({source:content,path:'credit',text:s.text},seg);Object.assign(old,m,{id:old.id});seg.common_keyframes=(seg.common_keyframes||[]).filter(k=>!/scale|position|alpha/i.test(k.property_type||''));}}
 require('./end-effect.cjs').append(d,require('./end-effect.cjs').timing(s.endEffect,d.duration/1e6),uid);return d;
}
function batchSettings(store,id){const b=require('./remix.cjs').get(store,id);return {settings:effective({},b.renderSettings||initial(b.settings)),updated:b.updated,count:b.projects.filter(p=>!p.installed).length,installed:b.projects.filter(p=>p.installed).length};}
function applyBatch(store,{id,settings,updated}){
 const remix=require('./remix.cjs'),b=remix.get(store,id);if(updated!==b.updated)throw Error('Bộ đã thay đổi. Mở lại thiết lập để áp dụng.');validate(settings);
 const pending=b.projects.filter(p=>!p.installed);if(!pending.length)throw Error('Không còn bản nháp chưa tạo CapCut.');
 for(const p of pending){
  if(p.editor){(p.editUndo??=[]).push({editor:structuredClone(p.editor),name:p.name,assignments:structuredClone(p.assignments),settings:structuredClone(p.settings||initial(b.settings))});p.editUndo=p.editUndo.slice(-5);p.editor.revision++;}
  p.settings=structuredClone(settings);p.editedAt=new Date().toISOString();
 }
 b.renderSettings=structuredClone(settings);remix.save(store,b);return {count:pending.length,skipped:b.projects.length-pending.length};
}
module.exports={effective,initial,validate,apply,batchSettings,applyBatch};
