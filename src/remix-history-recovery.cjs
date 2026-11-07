const path = require('node:path');
const fs = require('node:fs');
const remix = require('./remix.cjs');
const editor = require('./remix-editor.cjs');
const {bodyHashes} = require('./remix-allocation.cjs');
const norm = value => path.resolve(value).replaceAll('\\','/').toLowerCase();

function histories(store,batch,project){
 const rows=store.db.prepare(`SELECT id,created_at,path,name FROM projects WHERE niche_id=? AND status='REMIX_CREATED'
 AND (path=? OR (json_extract(snapshot,'$.remixBatchId')=? AND
 (json_extract(snapshot,'$.remixProjectId')=? OR (json_extract(snapshot,'$.remixProjectId') IS NULL AND name=?))))
 ORDER BY created_at DESC`).all(batch.channelId,project.installed||'',batch.id,project.id,project.name);
 return rows;
}
function segmentsFor(clip,draft){
 const videos=new Map(draft.materials.videos.map(m=>[m.id,m]));
 const segments=draft.tracks.filter(t=>t.type==='video').flatMap(t=>t.segments)
  .filter(s=>videos.get(s.material_id)?.path && norm(videos.get(s.material_id).path)===norm(clip.path))
  .sort((a,b)=>a.target_timerange.start-b.target_timerange.start);
 if(!segments.length)return null;
 if(clip.parts?.length){
  const groups=[];
  for(let i=0;i+clip.parts.length<=segments.length;i++){
   const group=segments.slice(i,i+clip.parts.length);
   if(group.every((s,j)=>{const r=s.source_timerange,part=clip.parts[j];
    return r && Math.abs(r.start-part.start*1e6)<=2 && Math.abs(r.duration-part.duration*1e6)<=2 &&
     (!j||Math.abs(group[j-1].target_timerange.start+group[j-1].target_timerange.duration-s.target_timerange.start)<=2);
   }))groups.push(group);
  }
  return groups.length===1?groups[0]:null;
 }
 const duration=segments.reduce((sum,s)=>sum+s.target_timerange.duration,0);
 const continuous=segments.every((s,i)=>s.source_timerange && (!i||Math.abs(segments[i-1].target_timerange.start+segments[i-1].target_timerange.duration-s.target_timerange.start)<=2));
 return continuous && duration===clip.duration && (clip.sourceStart==null||segments[0].source_timerange.start===clip.sourceStart)?segments:null;
}
function matchClip(snapshot,project,bi,si){
 const block=project.editor.blocks[bi];
 if(snapshot.slotHistory){
  const saved=snapshot.slotHistory.find(b=>b.id===block.id);
  if(saved && saved.units.length===block.units.length && saved.units.every((fp,i)=>block.units[i].empty||fp===block.units[i].fingerprint)){
   const fp=saved.units[si];
   const matches=snapshot.clips.filter(c=>c.fingerprint===fp&&c.role===(bi?'body':'hook'));
   if(matches.length===1)return matches[0];
  }
 }
 // Older exports have an ordered manifest but no block IDs. Require every surviving anchor.
 const blocks=bi?project.editor.blocks.slice(1):project.editor.blocks.slice(0,1);
 const units=blocks.flatMap(b=>b.units),clips=snapshot.clips.filter(c=>c.role===(bi?'body':'hook'));
 if(units.length!==clips.length || !units.some(u=>!u.empty) || units.some((u,i)=>!u.empty&&u.fingerprint!==clips[i].fingerprint))return null;
 return clips[units.indexOf(block.units[si])];
}
function recover(store,{id,choices={},apply=false,updated}){
 const batch=remix.get(store,id);
 if(apply && batch.updated!==updated)throw Error('Bộ đã thay đổi. Hãy xem trước lại.');
 const used=require('./remix-used.cjs')(store,batch.channelId,batch);
 for(const p of batch.projects)for(const fp of bodyHashes(p))used.add(fp);
 const relocated=new Map();
 for(const row of store.db.prepare('SELECT path,data FROM media').all()){
  const fp=JSON.parse(row.data).fingerprint;
  if(fp){if(!relocated.has(fp))relocated.set(fp,[]);relocated.get(fp).push(row.path);}
 }
 const blocked=require('./blacklist.cjs').matcher(store),rows=[],projects=[];
 for(const p of batch.projects){
  if(p.locked||(p.installed&&!p.mixUnlocked)||!p.editor?.blocks.some(b=>b.units.some(u=>u.empty)))continue;
  const history=histories(store,batch,p),selected=choices[p.id]??history[0]?.id;
  const record=history.find(h=>h.id===selected);
  const snapshot=record && JSON.parse(store.db.prepare('SELECT snapshot FROM projects WHERE id=?').get(record.id).snapshot);
  projects.push({id:p.id,name:p.name,history,selected:record?.id});
  const local=new Set(p.editor.blocks.flatMap(b=>b.units.map(u=>u.fingerprint)));
  let changed=false;
  for(const [bi,b] of p.editor.blocks.entries())for(const [si,u] of b.units.entries()){
   if(!u.empty)continue;
   const row={project:p.name,block:bi,slot:si+1};rows.push(row);
   if(!snapshot?.timelineSnapshot||!Array.isArray(snapshot.clips)){row.reason='Thiếu lịch sử timeline của lần xuất';continue;}
   const clip=matchClip(snapshot,p,bi,si);
   if(!clip?.fingerprint||!clip.path){row.reason='Không xác định chắc chắn vị trí trong lần xuất này';continue;}
   if(local.has(clip.fingerprint)||(bi&&used.has(clip.fingerprint))){row.reason='Footage đang được dùng hoặc được giữ cho video khác';continue;}
   const segments=segmentsFor(clip,snapshot.timelineSnapshot);
   if(!segments){row.reason='Không xác định duy nhất các đoạn cắt';continue;}
   const restored=editor.pack(snapshot.timelineSnapshot,segments,clip.fingerprint,clip.name);
   if(!fs.existsSync(restored.path)){
    const localPath=relocated.get(clip.fingerprint)?.find(file=>fs.existsSync(file));
    if(localPath){for(const material of restored.materials.videos)material.path=localPath;restored.path=localPath;}
   }
   if(blocked(restored)){row.reason='Footage bị chặn bản quyền';continue;}
   if(!fs.existsSync(restored.path)){row.reason='Thiếu file '+restored.path;continue;}
   row.clip=restored.name;row.cuts=segments.map(s=>[s.source_timerange.start/1e6,(s.source_timerange.start+s.source_timerange.duration)/1e6]);
   local.add(clip.fingerprint);if(bi)used.add(clip.fingerprint);
   if(apply){b.units[si]=restored;changed=true;}
  }
  if(changed){p.editor.revision++;p.editUndo=[];editor.rebuild(p);p.editedAt=new Date().toISOString();}
 }
 if(apply&&rows.some(row=>row.clip))remix.save(store,batch);
 return {rows,projects,updated:batch.updated};
}
module.exports={recover};
