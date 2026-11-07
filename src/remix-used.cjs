function exportedFootage(store,channelId,batch=null){
 const released=new Set(batch?.reopenedExports||[]);
 const used=new Set(store.db.prepare("SELECT DISTINCT u.fingerprint,u.project_id FROM usage u JOIN projects p ON p.id=u.project_id WHERE u.niche_id=? AND p.status IN ('CREATED','REMIX_CREATED')").all(channelId).filter(r=>!released.has(r.project_id)).map(r=>r.fingerprint));
 // Imported packages may contain installed drafts without local project history.
 for(const row of store.db.prepare('SELECT id,data FROM remix_batches WHERE channel_id=?').all(channelId))for(const p of JSON.parse(row.data).projects||[])if(p.installed&&!(row.id===batch?.id&&p.mixUnlocked&&!p.locked))for(const b of p.blocks||[])for(const c of b.clips||[])if(c.fingerprint)used.add(c.fingerprint);
 return used;
}
module.exports=exportedFootage;
