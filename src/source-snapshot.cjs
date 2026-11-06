// Source capture is local to the tool DB. Never consult external CapCut timelines.
const path=require('node:path');
const norm=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
const native=d=>d&&Array.isArray(d.tracks)&&d.materials&&d.tracks.some(t=>t.type==='video'&&t.segments?.length);
async function capture(store,ids){
 const cached=new Map(store.db.prepare('SELECT path,fingerprint FROM media').all().map(r=>[norm(r.path),r.fingerprint]));
 const mediaRows=store.db.prepare('SELECT path,fingerprint FROM media').all(),byHash=new Map();for(const m of mediaRows)if(m.fingerprint&&require('node:fs').existsSync(m.path)&&!byHash.has(m.fingerprint))byHash.set(m.fingerprint,m.path);
 let saved;
 const result=[],updates=[];
 for(const id of ids){const row=store.db.prepare('SELECT * FROM projects WHERE id=?').get(id);if(!row)throw Error('Không tìm thấy bản lưu trong tool: '+id);const snapshot=JSON.parse(row.snapshot);let draft=snapshot.timelineSnapshot,known={};
  if(!native(draft)&&native(snapshot.draft))draft=snapshot.draft;
  if(!native(draft)){
   saved??=store.db.prepare('SELECT data FROM remix_batches ORDER BY updated DESC').all().map(r=>JSON.parse(r.data));
   const match=saved.flatMap(b=>b.sources||[]).find(s=>s.id===id&&native(s.draft));
   if(match){draft=match.draft;known=match.fingerprints||{};}
  }
  if(!native(draft)&&snapshot.format==='ccb-manifest'&&Array.isArray(snapshot.clips)&&snapshot.clips.length){try{draft=require('./capcut-writer.cjs').build(snapshot,[],{checkFiles:false});}catch(e){throw Error('Không khôi phục được timeline từ bản lưu tool “'+row.name+'”: '+e.message);}}
  if(!native(draft))throw Error('Bản lưu “'+row.name+'” chưa có timeline đầy đủ trong tool. Hãy nhập gói bộ nguồn đã lưu từ máy cũ; tool không đọc lại dự án CapCut.');
  const fingerprints={...snapshot.sourceFingerprints,...known,...Object.fromEntries((snapshot.clips||[]).filter(c=>c.path&&c.fingerprint).map(c=>[norm(c.path),c.fingerprint]))};
  for(const m of draft.materials.videos||[])if(m.path&&!fingerprints[norm(m.path)]){const fp=cached.get(norm(m.path));if(fp)fingerprints[norm(m.path)]=fp;else if(require('node:fs').existsSync(m.path))fingerprints[norm(m.path)]=await require('./media.cjs').hash(m.path);}
  draft=structuredClone(draft);for(const m of draft.materials.videos||[]){if(!m.path||require('node:fs').existsSync(m.path))continue;const fingerprint=fingerprints[norm(m.path)],local=byHash.get(fingerprint);if(local){m.path=local;fingerprints[norm(local)]=fingerprint;}}
  if(!native(snapshot.timelineSnapshot))updates.push({id:row.id,snapshot:{...snapshot,timelineSnapshot:structuredClone(draft),sourceFingerprints:fingerprints}});
  result.push({id:row.id,name:row.name,path:'',draft:structuredClone(draft),meta:{},fingerprints});
 }
 if(updates.length){store.db.exec('SAVEPOINT source_snapshot');try{for(const update of updates)store.db.prepare('UPDATE projects SET snapshot=? WHERE id=?').run(JSON.stringify(update.snapshot),update.id);store.db.exec('RELEASE source_snapshot');}catch(e){store.db.exec('ROLLBACK TO source_snapshot');store.db.exec('RELEASE source_snapshot');throw e;}}
 return result;
}
module.exports={capture};
