const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function extractTransitions(json,effectType=19){
  const out=[],stack=[json];
  while(stack.length){const x=stack.pop();if(!x||typeof x!=='object')continue;const a=x.common_attr;if(a&&Number(a.effect_type)===effectType)out.push(a);for(const v of Object.values(x))if(v&&typeof v==='object')stack.push(v);}
  return out;
}
function resolveEffect(resource,root=path.join(process.env.LOCALAPPDATA||'','CapCut','User Data')){
 const r={...resource},id=String(r.effectId||r.effect_id||'');
 if(r.path&&fs.existsSync(path.join(r.path,'config.json')))return r;
 if(!/^\d+$/.test(id))return r;
 const base=path.join(root,'Cache','effect',id);let dirs=[];try{dirs=fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-f0-9]{16,64}$/i.test(d.name));}catch{return r;}
 const preferred=r.md5||path.basename((r.path||'').replaceAll('\\','/'));
 dirs.sort((a,b)=>Number(b.name===preferred)-Number(a.name===preferred)||a.name.localeCompare(b.name));
 const found=dirs.find(d=>fs.existsSync(path.join(base,d.name,'config.json')));if(found)r.path=path.join(base,found.name);return r;
}
function localResource(a,effectRoot,effectType=19){
  const id=String(a.effect_id||''),md5=String(a.md5||'');
  if(!/^\d+$/.test(id)||!/^[a-f0-9]{16,64}$/i.test(md5))return null;
  const folder=path.join(effectRoot,id,md5),config=path.join(folder,'config.json');
  const resolved=resolveEffect({effectId:id,path:folder,md5},path.dirname(path.dirname(effectRoot)));if(!fs.existsSync(path.join(resolved.path,'config.json')))return null;
  let extra={};try{extra=JSON.parse(a.extra||'{}');}catch{}
  return {effectId:id,resourceId:String(a.id||id),name:String(a.title||a.name||id),md5,path:resolved.path,effectType,isPro:!!extra.is_vip,source:'capcut-local-cache',duration:Number(extra.effect_duration||3000)/1000,adjustParams:(()=>{try{return (JSON.parse(a.sdk_extra||'{}').setting?.effect_adjust_params||[]).map(p=>({name:p.effect_key,value:p.default,default_value:p.default}));}catch{return [];}})()};
}
async function scanTransitions(root=path.join(process.env.LOCALAPPDATA||'','CapCut','User Data'),effectType=19){
  const effectRoot=path.join(root,'Cache','effect'),dbRoot=path.join(root,'Cache','ressdk_db'),items=new Map(),warnings=[];
  let scannedDatabases=0,metadataCount=0;
  let dirs;try{dirs=await fs.promises.readdir(dbRoot,{withFileTypes:true});}catch{dirs=[];warnings.push('Không đọc được cache danh mục CapCut; đang tìm trong dự án có sẵn.');}
  for(const dir of dirs.filter(d=>d.isDirectory())){
    const file=path.join(dbRoot,dir.name,'rp.db');if(!fs.existsSync(file))continue;let db;
    try{
      db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');scannedDatabases++;
      let n=0;
      // CapCut 9.6 stores current resource metadata as cached JSON responses.
      // Type 19 was verified against materials.transitions in local drafts.
      for(const row of db.prepare('SELECT response_body FROM http_cache').iterate()){
        if(!new RegExp('"effect_type"\\s*:\\s*'+effectType+'\\s*[,}]').test(row.response_body))continue;
        let data;try{data=JSON.parse(row.response_body);}catch{continue;}
        for(const a of extractTransitions(data,effectType)){metadataCount++;const item=localResource(a,effectRoot,effectType);if(item&&!items.has(item.effectId))items.set(item.effectId,item);}
        if(++n%10===0)await new Promise(r=>setImmediate(r));
      }
    }catch{warnings.push('Một danh mục cache không đọc được; hãy đóng CapCut rồi thử quét lại.');}finally{db?.close();}
    await new Promise(r=>setImmediate(r));
  }
  // A downloaded effect may no longer appear in the HTTP metadata cache.
  const projects=path.join(root,'Projects','com.lveditor.draft');let projectDirs=[];try{projectDirs=await fs.promises.readdir(projects,{withFileTypes:true});}catch{}
  for(const dir of projectDirs.filter(d=>d.isDirectory())){try{const file=path.join(projects,dir.name,'draft_content.json');const stat=await fs.promises.stat(file);if(stat.size>64*1024*1024)continue;const draft=JSON.parse(await fs.promises.readFile(file,'utf8'));for(const m of draft.materials?.[effectType===19?'transitions':'video_effects']||[]){if(!/^\d+$/.test(String(m.effect_id||'')))continue;const item=resolveEffect({effectId:String(m.effect_id),resourceId:String(m.resource_id||m.effect_id),name:m.name||String(m.effect_id),path:m.path,effectType,source:'capcut-local-draft',adjustParams:m.adjust_params||[]},root);if(item.path&&fs.existsSync(path.join(item.path,'config.json'))&&!items.has(item.effectId))items.set(item.effectId,item);}}catch{}await new Promise(r=>setImmediate(r));}
  return {items:[...items.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi')),warnings:[...new Set(warnings)],scannedDatabases,metadataCount,scannedAt:new Date().toISOString()};
}
module.exports={extractTransitions,localResource,scanTransitions,resolveEffect};
