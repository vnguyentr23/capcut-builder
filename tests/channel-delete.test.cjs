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
