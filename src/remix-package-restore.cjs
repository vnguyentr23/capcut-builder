const fs=require('node:fs');
const path=require('node:path');
const remix=require('./remix.cjs');
const allocation=require('./remix-allocation.cjs');
const transfer=require('./remix-transfer.cjs');
const eligible=p=>!p.locked&&(!p.installed||p.mixUnlocked);
const lineage=b=>[b.id,b.originPackageId].filter(Boolean);
const norm=file=>path.resolve(file).replaceAll('\\','/').toLowerCase();
function matchesFor(p,projects){
 const byId=projects.filter(q=>lineage(p).some(key=>lineage(q).includes(key)));
 if(byId.length)return byId;
 return projects.filter(q=>p.name&&p.sourceName&&q.name===p.name&&q.sourceName===p.sourceName);
}

function preview(store,id,pkg,mappings){
 const batch=remix.get(store,id),old=pkg.body.batch;
 if(!old.projects.length)throw Error('Đây là bộ nguồn. Hãy chọn gói của bộ nhân bản trước khi cân bằng.');
 const proposed=new Map(),rows=[];
 for(const p of batch.projects.filter(eligible)){
  const row={name:p.name,before:p.draft.duration/1e6};rows.push(row);
  const matches=matchesFor(p,old.projects);
  if(matches.length!==1){row.reason='Không xác định duy nhất video tương ứng';continue;}
  if(batch.projects.filter(other=>matchesFor(other,old.projects).includes(matches[0])).length!==1){row.reason='Một video trong gói khớp với nhiều dự án hiện tại';continue;}
  row.sourceName=matches[0].name;
  const q=matches[0],required=[
   ...q.draft.materials.videos,...require('./sound-effects.cjs').resources(q.draft),...(q.assignments||[]),q.settings?.intro||old.renderSettings?.intro||old.settings?.intro
  ].filter(m=>m?.path);
  const absent=required.find(m=>!mappings[norm(m.path)]||!fs.existsSync(mappings[norm(m.path)]));
  if(absent){row.reason='Thiếu file đã đối chiếu: '+path.basename(absent.path);continue;}
  const restored=transfer.rewrite(q,mappings);
  Object.assign(restored,{id:p.id,name:p.name,installed:p.installed,locked:p.locked,mixUnlocked:p.mixUnlocked,originPackageId:p.originPackageId,editUndo:[]});
  restored.draft.name=p.name;
  restored.settings=transfer.rewrite(require('./remix-settings.cjs').effective(q,old.renderSettings||old.settings),mappings);
  if(restored.editor)restored.editor.revision=(p.editor?.revision||0)+1;
  const denied=require('./blacklist.cjs').projectIssues(store,restored);
  if(denied.length){row.reason='Footage bị chặn: '+denied.join(', ');continue;}
  proposed.set(p.id,{restored,row});
  row.after=q.draft.duration/1e6;
 }
 // A rejected replacement keeps its current Body reserved. Recheck until stable.
 const exported=require('./remix-used.cjs')(store,batch.channelId,batch);
 let changed;
 do{
  changed=false;
  const owners=new Map();
  for(const p of batch.projects){
   const candidate=proposed.get(p.id)?.restored||p;
   for(const fp of allocation.bodyHashes(candidate).filter(Boolean)){
    if(!owners.has(fp))owners.set(fp,[]);
    owners.get(fp).push(p.id);
   }
  }
  for(const [key,{restored,row}] of proposed){
   if(allocation.bodyHashes(restored).some(fp=>fp&&(owners.get(fp).length>1||exported.has(fp)))){
    row.reason='Body trùng với video khác hoặc footage đã xuất';proposed.delete(key);changed=true;
   }
  }
 }while(changed);
 return {id,updated:batch.updated,rows,proposed};
}
function apply(store,plan){
 const batch=remix.get(store,plan.id);
 if(batch.updated!==plan.updated)throw Error('Bộ đã thay đổi. Hãy đối chiếu lại.');
 for(const p of batch.projects){
  const next=plan.proposed.get(p.id);
  if(!next)continue;
  if(!eligible(p)||require('./blacklist.cjs').projectIssues(store,next.restored).length)throw Error('Điều kiện khôi phục đã thay đổi. Hãy đối chiếu lại.');
 }
 batch.projects=batch.projects.map(p=>plan.proposed.get(p.id)?.restored||p);
 remix.save(store,batch);return plan.proposed.size;
}
module.exports={preview,apply,matchesFor};
