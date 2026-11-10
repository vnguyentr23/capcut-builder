function exportedFootage(store,channelId,batch=null,excludeProjectId=null){
 const released=new Set(batch?.reopenedExports||[]);
 const used=new Set(store.db.prepare("SELECT DISTINCT u.fingerprint,u.project_id FROM usage u JOIN projects p ON p.id=u.project_id WHERE u.niche_id=? AND p.status IN ('CREATED','REMIX_CREATED')").all(channelId).filter(r=>!released.has(r.project_id)).map(r=>r.fingerprint));
 // Imported packages may contain installed drafts without local project history.
 const rows=store.db.prepare(`SELECT rb.id AS batch_id,json_extract(p.value,'$.id') AS project_id,
 json_extract(p.value,'$.mixUnlocked') AS unlocked,json_extract(p.value,'$.locked') AS locked,
 json_extract(c.value,'$.fingerprint') AS fingerprint
 FROM remix_batches rb,json_each(rb.data,'$.projects') p,json_each(p.value,'$.blocks') bl,json_each(bl.value,'$.clips') c
 WHERE rb.channel_id=? AND json_extract(p.value,'$.installed') IS NOT NULL`).all(channelId);
 for(const row of rows)if(!(row.batch_id===batch?.id&&(row.project_id===excludeProjectId||row.unlocked&&!row.locked))&&row.fingerprint)used.add(row.fingerprint);

 return used;
}
module.exports=exportedFootage;

// Display history includes exports reopened for editing; it does not reserve footage.
module.exports.locations=function(store,channelId){
 const map=new Map(),add=(hash,name)=>{if(!hash||!name)return;const names=map.get(hash)||[];if(!names.includes(name))names.push(name);map.set(hash,names);};
 for(const row of store.db.prepare("SELECT DISTINCT u.fingerprint,p.name FROM usage u JOIN projects p ON p.id=u.project_id WHERE u.niche_id=? AND p.status IN ('CREATED','REMIX_CREATED')").all(channelId))add(row.fingerprint,row.name);
 for(const row of store.db.prepare(`SELECT json_extract(p.value,'$.name') name,json_extract(c.value,'$.fingerprint') fingerprint
 FROM remix_batches rb,json_each(rb.data,'$.projects') p,json_each(p.value,'$.blocks') bl,json_each(bl.value,'$.clips') c
 WHERE rb.channel_id=? AND json_extract(p.value,'$.installed') IS NOT NULL`).all(channelId))add(row.fingerprint,row.name);
 return map;
};
