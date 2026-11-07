const fields={
 niches:['id','name','state'],channels:['id','root_id','name'],
 projects:['id','niche_id','name','status','path','created_at','snapshot'],
 usage:['niche_id','fingerprint','project_id','role'],reservations:['niche_id','draft_id','fingerprint'],
 remix_batches:['id','root_id','channel_id','name','data','updated','summary']
};
function list(store){
 const rows=store.db.prepare(`SELECT key,json_extract(value,'$.channel.id') id,json_extract(value,'$.channel.root_id') root,json_extract(value,'$.channel.name') name,json_extract(value,'$.workspace.name') niche,json_extract(value,'$.deletedAt') deletedAt
 FROM preferences WHERE key GLOB 'deleted-channel:*'
 UNION ALL SELECT p.key,json_extract(j.value,'$.id'),json_extract(j.value,'$.root_id'),json_extract(j.value,'$.name'),json_extract(p.value,'$.state.name'),json_extract(p.value,'$.deletedAt')
 FROM preferences p,json_each(p.value,'$.channels') j WHERE p.key GLOB 'deleted-niche:*' AND json_extract(j.value,'$.id')<>json_extract(j.value,'$.root_id') ORDER BY deletedAt DESC`).all();
 const active=new Set(store.db.prepare('SELECT id FROM channels').all().map(r=>r.id));
 return rows.filter(r=>r.id&&!active.has(r.id)).map(r=>({...r,restoreRoot:!active.has(r.root)}));
}
function insert(store,table,row){
 const cols=fields[table],values=cols.map(k=>row[k]??(k==='summary'?'{}':null));
 store.db.prepare('INSERT INTO '+table+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...values);
}
function restore(store,selection){
 if(!Array.isArray(selection)||!selection.length)throw Error('Chọn ít nhất một kênh cần khôi phục.');
 store.db.exec('BEGIN IMMEDIATE');
 try{
  const available=list(store),cache=new Map();let first;
  function archive(key){
   if(!cache.has(key))cache.set(key,JSON.parse(store.pref(key)||'null'));
   return cache.get(key);
  }
  function recover(c,ws,s){
   if(!ws||ws.id!==c.id)throw Error('Bản lưu thiếu dữ liệu của '+c.name+'.');
   if(c.id===c.root_id){
    if(store.list().some(n=>n.name.toLocaleLowerCase()===ws.name.toLocaleLowerCase()))throw Error('Đã có ngách khác cùng tên '+ws.name+'.');
   }else if(store.db.prepare('SELECT name FROM channels WHERE root_id=?').all(c.root_id).some(x=>x.name.toLocaleLowerCase()===c.name.toLocaleLowerCase()))throw Error('Ngách '+ws.name+' đã có kênh '+c.name+'.');
   insert(store,'niches',ws);insert(store,'channels',c);
   for(const table of ['projects','usage','reservations'])for(const r of s[table]||[])if(r.niche_id===c.id)insert(store,table,r);
   for(const r of s.batches||[])if(r.channel_id===c.id)insert(store,'remix_batches',r);
  }
  for(const {key,id} of selection){
   const row=available.find(r=>r.key===key&&r.id===id);
   if(!row)throw Error('Kênh đã được khôi phục hoặc bản lưu không còn tồn tại.');
   const s=archive(key);
   if(!store.db.prepare('SELECT id FROM channels WHERE id=?').get(row.root)){
    const parent=archive('deleted-niche:'+row.root);
    const root=parent?.channels?.find(c=>c.id===row.root);
    if(!root)throw Error('Thiếu bản lưu ngách '+row.niche+'.');
    recover(root,parent.workspaces.find(w=>w.id===root.id),parent);
   }
   const child=s.channel||s.channels.find(c=>c.id===id);
   recover(child,s.workspace||s.workspaces.find(w=>w.id===id),s);
   if(!first)first=child;
  }
  store.pref('active',first.id);store.pref('channel-active:'+first.root_id,first.id);
  store.db.exec('COMMIT');return first.id;
 }catch(e){store.db.exec('ROLLBACK');throw e;}
}
module.exports={list,restore};
