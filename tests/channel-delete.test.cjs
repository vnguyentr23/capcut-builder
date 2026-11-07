const test=require('node:test'),assert=require('node:assert/strict');const {Store}=require('../src/store.cjs'),channels=require('../src/channels.cjs');
test('Delete channel protects root, archives local data and preserves sibling and shared library',()=>{const store=new Store(':memory:');try{const root=store.create('Niche'),a=channels.create(store,root.id,'A'),b=channels.create(store,root.id,'B');const before=store.get(root.id);assert.throws(()=>channels.remove(store,root.id),/Kênh gốc/);store.db.prepare('INSERT INTO reservations VALUES(?,?,?)').run(a.id,'draft','fp');const id=channels.remove(store,a.id);assert.equal(id,root.id);assert.deepEqual(channels.list(store,root.id).map(c=>c.id),[root.id,b.id]);assert.deepEqual(store.get(root.id),before);assert.equal(store.get(b.id).channelName,'B');assert.equal(store.db.prepare('SELECT COUNT(*) n FROM reservations WHERE niche_id=?').get(a.id).n,0);const backup=JSON.parse(store.pref('deleted-channel:'+a.id));assert.equal(backup.reservations.length,1);assert.equal(backup.workspace.id,a.id);assert.equal(store.pref('active'),root.id);}finally{store.close();}});
test('Deleting a shared channel removes all its workspaces but preserves unrelated active channels',()=>{
 const store=new Store(':memory:');try{
  const a=store.create('Niche A'),b=store.create('Niche B'),c=store.create('Niche C');
  const one=channels.create(store,a.id,'Kênh 2'),two=channels.create(store,b.id,'KÊNH 2'),other=channels.create(store,b.id,'Other');
  store.pref('channel-active:'+b.id,other.id);
  assert.deepEqual(channels.removalScope(store,one.id).map(c=>c.niche),['Niche A','Niche B']);
  assert.equal(channels.remove(store,one.id),a.id);
  assert.equal(store.pref('channel-active:'+b.id),other.id);
  for(const root of [a,b,c])assert(!channels.headerList(store,root.id).some(x=>x.name.toLowerCase()==='kênh 2'));
  for(const p of [one,two])assert(store.pref('deleted-channel:'+p.id));
  assert.equal(store.get(other.id).channelName,'Other');
 }finally{store.close();}
});
test('Restore selected deleted channels together with missing parent, history and batch, without reviving unrelated children',()=>{
 const s=new Store(':memory:'),trash=require('../src/channel-restore.cjs');try{
  const a=s.create('Ngách A'),x=channels.create(s,a.id,'Kênh 2'),y=channels.create(s,a.id,'Kênh 3');
  s.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run('hist',x.id,'Video','WORKING','','now','{}');
  s.db.prepare('INSERT INTO usage VALUES(?,?,?,?)').run(x.id,'fp','hist','body');
  s.db.prepare('INSERT INTO remix_batches VALUES(?,?,?,?,?,?,?)').run('batch',a.id,x.id,'B','{}','now','{}');
  channels.remove(s,x.id);s.deleteNiche(a.id);
  const rows=trash.list(s);assert.equal(rows.length,2);assert(rows.every(r=>r.restoreRoot));
  assert.equal(trash.restore(s,[rows.find(r=>r.id===x.id)]),x.id);
  assert.deepEqual(s.list().map(r=>r.id),[a.id]);assert.equal(s.get(x.id).channelName,'Kênh 2');
  assert.equal(s.history(x.id).length,1);assert(s.used(x.id).has('fp'));assert(s.db.prepare('SELECT id FROM remix_batches WHERE id=?').get('batch'));
  assert.deepEqual(trash.list(s).map(r=>r.id),[y.id]);trash.restore(s,trash.list(s));assert.equal(s.get(y.id).channelName,'Kênh 3');
 }finally{s.close();}
});
test('Restore rolls back all rows on channel-name conflict',()=>{
 const s=new Store(':memory:'),trash=require('../src/channel-restore.cjs');try{
  const a=s.create('A'),b=s.create('B'),one=channels.create(s,a.id,'Shared'),two=channels.create(s,b.id,'Shared');
  channels.remove(s,one.id);channels.create(s,b.id,'shared');
  const rows=trash.list(s);assert.throws(()=>trash.restore(s,[rows.find(r=>r.id===one.id),rows.find(r=>r.id===two.id)]),/đã có kênh/);
  assert.equal(trash.list(s).length,2);
 }finally{s.close();}
});
