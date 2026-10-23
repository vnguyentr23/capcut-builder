const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function extractTransitions(json,effectType=19){
  const out=[],stack=[json];
  while(stack.length){const x=stack.pop();if(!x||typeof x!=='object')continue;const a=x.common_attr;if(a&&Number(a.effect_type)===effectType)out.push(a);for(const v of Object.values(x))if(v&&typeof v==='object')stack.push(v);}
  return out;
}
function localResource(a,effectRoot,effectType=19){
  const id=String(a.effect_id||''),md5=String(a.md5||'');
  if(!/^\d+$/.test(id)||!/^[a-f0-9]{16,64}$/i.test(md5))return null;
  const folder=path.join(effectRoot,id,md5),config=path.join(folder,'config.json');
  try{if(!fs.statSync(folder).isDirectory()||!fs.statSync(config).isFile())return null;}catch{return null;}
  let extra={};try{extra=JSON.parse(a.extra||'{}');}catch{}
  return {effectId:id,resourceId:String(a.id||id),name:String(a.title||a.name||id),md5,path:folder,effectType,isPro:!!extra.is_vip,source:'capcut-local-cache',duration:Number(extra.effect_duration||3000)/1000,adjustParams:(()=>{try{return (JSON.parse(a.sdk_extra||'{}').setting?.effect_adjust_params||[]).map(p=>({name:p.effect_key,value:p.default,default_value:p.default}));}catch{return [];}})()};
}
async function scanTransitions(root=path.join(process.env.LOCALAPPDATA||'','CapCut','User Data'),effectType=19){
  const effectRoot=path.join(root,'Cache','effect'),dbRoot=path.join(root,'Cache','ressdk_db'),items=new Map(),warnings=[];
  let scannedDatabases=0,metadataCount=0;
  let dirs;try{dirs=await fs.promises.readdir(dbRoot,{withFileTypes:true});}catch{return {items:[],warnings:['Không đọc được danh mục tài nguyên CapCut trên máy.'],scannedDatabases,metadataCount};}
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
  return {items:[...items.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi')),warnings:[...new Set(warnings)],scannedDatabases,metadataCount,scannedAt:new Date().toISOString()};
}
module.exports={extractTransitions,localResource,scanTransitions};
